# ForgeQuote — Operations Runbook

Security logging, backups, and the recovery procedures that go with them.
Companion to [SECURITY_AUDIT.md](SECURITY_AUDIT.md).

---

## 1. Security logging

### What is logged

Every authentication and privileged action emits one JSON line on the
dedicated `security` logger ([security_log.py](../backend/app/core/security_log.py)):

```json
{"ts":"2026-07-30T17:02:36Z","event":"auth.login","outcome":"failure",
 "user_id":"9856dbac-…","email":"bh***@example.com","ip":"203.0.113.9",
 "path":"/api/auth/login","reason":"bad_password","failed_count":3}
```

| Event | Fires when |
|---|---|
| `auth.register` | Signup succeeds, or is refused (duplicate / reserved address) |
| `auth.login` | Success, bad password, unknown account, locked, missing/bad TOTP |
| `auth.logout` | Session ended |
| `auth.password_reset.requested` / `.completed` | Reset flow, both halves |
| `auth.password_change` | Password changed while signed in |
| `auth.email_verified` | Address confirmed, or a bad token presented |
| `auth.totp.enabled` / `.disabled` / `.backup_code_used` | Second-factor lifecycle |
| `admin.role_change` | Role granted or revoked via the CLI |
| `admin.config` / `admin.billing` | Shared pricing or points-package edits |
| `account.delete` | GDPR erasure |
| `authz.denied` | A non-admin attempted a privileged action |
| `session.rejected` / `session.expired` | Stale or timed-out session presented |
| `rate_limit_exceeded` | Any throttle tripped |
| `upload.malware_blocked` | Scanner rejected a file |

**Never logged:** passwords, JWTs, refresh tokens, reset/verification tokens,
TOTP secrets or recovery codes. `security_log.py` filters these by field name
even if a caller passes one by mistake, and emails are masked. This is enforced
by `test_security_log_never_records_secrets`.

### Shipping to a SIEM

The logger is deliberately separate from application chatter, so it can be
routed without a filter. Add to `docker-compose.yml`:

```yaml
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "10"
        labels: "service=forgequote"
```

Then point a collector at the container log. With Vector:

```toml
[sources.forgequote]
type = "docker_logs"
include_containers = ["quote-backend"]

# The security logger prefixes each line with "security_event ".
[transforms.security_events]
type = "remap"
inputs = ["forgequote"]
source = '''
  if contains(string!(.message), "security_event ") {
    .parsed = parse_json(replace(string!(.message), r'^.*security_event ', "")) ?? {}
    .is_security = true
  }
'''

[sinks.siem]
type = "elasticsearch"          # or splunk_hec, datadog_logs, loki
inputs = ["security_events"]
endpoint = "https://siem.internal:9200"
```

### Alerts worth configuring

| Condition | Why |
|---|---|
| `auth.login` failures > 20 from one IP in 5 min | Credential stuffing past the rate limiter |
| `auth.login` `reason=account_locked` spike | Targeted attack or a broken client |
| Any `admin.role_change` | Privilege grants must never be a surprise |
| Any `admin.config` outside change windows | Shared pricing edited unexpectedly |
| `authz.denied` repeated from one user | Someone probing for privileged endpoints |
| `auth.totp.disabled` without a preceding `auth.login` from a known device | Classic account-takeover step |
| Any `upload.malware_blocked` | Confirmed malicious upload attempt |
| `account.delete` | Irreversible; worth a human seeing it |

Retention: keep security events **at least 12 months**. The privacy policy
commits to a 24-month general retention ceiling, so cap them at 24 months.

---

## 2. Backups

### What must be backed up

| Item | Where | Loss impact |
|---|---|---|
| PostgreSQL database | `postgres_data` volume | Total — all quotes, users, customers |
| Uploaded CAD files & PDFs | `uploads_data` volume | Customer files unrecoverable |
| `JWT_SECRET_KEY` | `.env` | All sessions invalidated (recoverable) |
| **`FIELD_ENCRYPTION_KEY`** | `.env` | **Encrypted columns unreadable forever** |

> **The encryption key is not in the database backup.** Store it in a secrets
> manager or sealed envelope, separate from the database dump. A database
> backup without the key cannot be fully restored.

### Nightly backup

```bash
#!/usr/bin/env bash
# /opt/forgequote/backup.sh — run from cron at 02:00
set -euo pipefail

BACKUP_DIR=/var/backups/forgequote
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

# Database. Custom format (-Fc) so pg_restore can do selective restores.
docker compose exec -T postgres pg_dump -U quote_user -Fc quote_db \
  > "$BACKUP_DIR/db-$STAMP.dump"

# Uploaded files.
docker run --rm \
  -v quote_uploads_data:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/uploads-$STAMP.tar.gz" -C /data .

# Verify the dump is readable before trusting it — a corrupt dump that is
# never opened is the classic backup failure.
pg_restore --list "$BACKUP_DIR/db-$STAMP.dump" > /dev/null

# Encrypt at rest, then ship off-host. A backup on the same machine does not
# survive the failure it exists for.
age -r "$BACKUP_AGE_RECIPIENT" \
  -o "$BACKUP_DIR/db-$STAMP.dump.age" "$BACKUP_DIR/db-$STAMP.dump"
rm -f "$BACKUP_DIR/db-$STAMP.dump"

aws s3 sync "$BACKUP_DIR" "s3://$BACKUP_BUCKET/forgequote/" --storage-class STANDARD_IA

find "$BACKUP_DIR" -type f -mtime +14 -delete
```

Retention: 14 days local, 90 days off-site, 12 monthly archives.

### Restore drill

**An untested backup is not a backup.** Run this quarterly, against a scratch
database — never production:

```bash
# 1. Restore into a throwaway database
docker compose exec -T postgres createdb -U quote_user restore_test
age -d -i "$AGE_KEY" db-20260730-020000.dump.age > /tmp/restore.dump
docker compose exec -T postgres pg_restore -U quote_user -d restore_test < /tmp/restore.dump

# 2. Confirm the data is actually there
docker compose exec -T postgres psql -U quote_user -d restore_test -c \
  "SELECT (SELECT count(*) FROM users) AS users,
          (SELECT count(*) FROM quotes) AS quotes,
          (SELECT max(created_at) FROM quotes) AS newest_quote;"

# 3. Confirm encrypted columns decrypt with the archived key —
#    this is the step that catches a lost FIELD_ENCRYPTION_KEY.
DATABASE_URL=postgresql+asyncpg://quote_user:...@127.0.0.1:5432/restore_test \
FIELD_ENCRYPTION_KEY="$ARCHIVED_KEY" \
  python -c "
import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.models import Customer

async def main():
    async with async_session_maker() as s:
        rows = (await s.execute(select(Customer).limit(5))).scalars().all()
        for c in rows:
            print(c.name, '| phone:', c.phone, '| gstin:', c.gstin)
        print('decryption OK')
asyncio.run(main())
"

# 4. Clean up
docker compose exec -T postgres dropdb -U quote_user restore_test
rm -f /tmp/restore.dump
```

Record the date and row counts of each drill. If step 3 fails, the key is lost
or wrong — fix that before the next incident, not during one.

---

## 3. Incident response

### Suspected account takeover

```bash
# 1. End every session for the account immediately.
docker compose exec -T postgres psql -U quote_user -d quote_db -c \
  "UPDATE users SET session_id=NULL, session_started_at=NULL,
                    refresh_token_hash=NULL, refresh_token_expires_at=NULL
   WHERE email='victim@example.com';"

# 2. Pull their security history.
docker compose logs backend | grep security_event | grep 'vi\*\*\*@example.com'

# 3. If privileged, revoke first and investigate after.
docker compose exec backend python -m app.manage revoke-admin victim@example.com
```
Then have the user reset their password (which invalidates all sessions again)
and re-enrol TOTP.

### Suspected credential-database exposure

1. Rotate `JWT_SECRET_KEY` — invalidates every session globally.
2. Rotate `FIELD_ENCRYPTION_KEY` **only after** re-encrypting existing rows;
   rotating first makes the data unreadable.
3. Passwords are Argon2id — not directly reversible, but force a reset anyway.
4. Reset and verification tokens are stored hashed and are short-lived; expire
   them all: `DELETE FROM password_reset_tokens; DELETE FROM email_verification_tokens;`

### Compromised admin

```bash
docker compose exec backend python -m app.manage list-admins       # who holds it
docker compose exec backend python -m app.manage revoke-admin bad@example.com
docker compose logs backend | grep '"event": "admin.config"'       # what they changed
```
Shared pricing edits are logged with the acting user and changed fields, so the
blast radius is enumerable. Per-workspace rates are unaffected — an admin
cannot reach another tenant's private catalog.

---

## 4. Routine maintenance

| Cadence | Task |
|---|---|
| Daily | Confirm backup job succeeded; check `rate_limit_exceeded` volume |
| Weekly | Review `admin.*` events; check the scheduled dependency-audit run |
| Monthly | Review `list-admins`; check for accounts stuck unverified |
| Quarterly | **Restore drill (§2)**; rotate `JWT_SECRET_KEY`; review retention |
| Annually | Re-run the audit in SECURITY_AUDIT.md; review the policy pages |
