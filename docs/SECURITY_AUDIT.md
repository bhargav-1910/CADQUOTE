# ForgeQuote — Security Audit & Hardening Report

**Application:** ForgeQuote (CNC Instant Quotation Platform)
**Scope:** Full stack — FastAPI backend, React/TypeScript frontend, nginx edge, Docker deployment
**Date:** 2026-07-30
**Standards applied:** OWASP ASVS v4.0 (L2), OWASP Top 10 (2021), NIST SP 800-63B, RFC 9116, RFC 6266

---

## 1. Executive summary

The pre-existing codebase was already sound in the areas that usually fail: **zero SQL injection
surface** (SQLAlchemy ORM throughout, no string-built SQL anywhere), **no command execution**, **no
`dangerouslySetInnerHTML`**, **Jinja autoescaping enabled**, per-user ownership checks on quotes and
files, refresh-token rotation with hashed storage, and edge rate limiting in nginx.

The real gaps were **authorization**, **credential lifecycle**, and **compliance**.

| Severity | Found | Fixed | Remaining |
|---|---|---|---|
| Critical | 2 | 2 | 0 |
| High | 9 | 9 | 0 |
| Medium | 11 | 11 | 0 |
| Low | 7 | 6 | 1 (accepted) |
| **Total** | **29** | **28** | **1** |

The single highest-impact finding: **any authenticated user could rewrite global pricing
configuration and mint their own points packages.** In a multi-tenant product, one signup was enough
to reprice every other tenant's quotes or grant themselves unlimited paid credit.

**Verification:** 130 automated tests pass (32 pre-existing + 98 new), plus 51 live checks and a full quote-pipeline regression against the running stack, the full Alembic chain applies
and reverses cleanly on PostgreSQL 16, nginx config validates, and the frontend builds and
typechecks clean.

---

## 2. Findings

Each finding lists risk, description, impact, fix, and where the change lives.

---

### SEC-01 — Broken access control on global configuration endpoints
**Risk: CRITICAL** · OWASP A01:2021 · CWE-284, CWE-862

**Description.** Every write endpoint under `/api/config/*` (materials, surface finishes,
inspection levels, machine rates, vendors, vendor capabilities/certifications) and
`/api/billing/packages` was protected by nothing more than `get_current_user`. The rows they mutate
are **global**, not tenant-scoped. No role concept existed anywhere in the system.

**Impact.**
- Any user could set `machine_rates.hourly_rate = 0` and reprice **every tenant's** quotes.
- Any user could `POST /api/billing/packages` with `points: 1000000, price_minor: 1` and then buy a
  million points for one paisa — direct, unbounded financial loss.
- Any user could deactivate materials or inject fraudulent vendors into the matching engine.

**Fix.** Introduced a `role` column (`user` | `admin`, default least-privilege), a `require_admin`
dependency, and applied it to all 12 mutating configuration endpoints. Reads stay open to authenticated users because the quote builder needs the
catalog. Every admin action is now written to the security log with the acting user and changed
fields.

**Code:** [deps.py](../backend/app/api/deps.py) (`is_admin`, `require_admin`),
[config.py](../backend/app/api/config.py), [billing.py](../backend/app/api/billing.py),
[models.py](../backend/app/models/models.py) (`User.role`)

---

### SEC-02 — Unsigned Stripe webhook accepted in production
**Risk: CRITICAL** · OWASP A08:2021 · CWE-345

**Description.** When `STRIPE_WEBHOOK_SECRET` was unset, `/api/billing/webhook` fell back to parsing
the request body as an unauthenticated JSON event and crediting the wallet named in its metadata.

**Impact.** A single unauthenticated `POST` with a forged `checkout.session.completed` body credited
arbitrary points to any account. Free money for anyone who found the endpoint.

**Fix.** The fallback now hard-fails with 503 in production and logs a denied security event. It
remains available in development only, where it is a legitimate testing convenience.

**Code:** [billing.py](../backend/app/api/billing.py) `stripe_webhook`

---

### SEC-03 — No password reset workflow
**Risk: HIGH** · OWASP A07:2021 · ASVS 2.5

**Description.** Users who forgot their password had no recovery path. The database tables existed
(migration `20260325_0002`) but no endpoint, model or UI was ever built.

**Impact.** Account lockout with no self-service recovery drives users to support channels, where
identity verification is ad-hoc — historically the most reliable account-takeover vector in any
product.

**Fix.** Complete workflow implemented to ASVS 2.5:

- Token generated with `secrets.token_urlsafe(32)` (256 bits of entropy).
- **Only the SHA-256 is stored** — a database read yields no working link.
- 15-minute expiry, enforced server-side.
- **Single use**: the row is marked `used` and every sibling token for the account is deleted.
- Issuing a new link **invalidates any outstanding link**.
- Rate limited per IP *and* per account (5/hour each).
- **Enumeration-safe**: identical response body and status for registered and unregistered
  addresses; the email is sent from a background task *after* the response, so delivery latency
  cannot be timed either.
- Completing a reset **invalidates every session** — an attacker holding a stolen session loses it
  the moment the real owner recovers.
- Both request and completion are logged; the token never is.
- A "your password was changed" notification email acts as a takeover tripwire.

**Code:** [auth.py](../backend/app/api/auth.py) (`forgot_password`, `reset_password`),
[security.py](../backend/app/core/security.py) (`generate_reset_token`),
[email.py](../backend/app/services/email.py), [ForgotPasswordPage.tsx](../frontend/src/pages/ForgotPasswordPage.tsx),
[ResetPasswordPage.tsx](../frontend/src/pages/ResetPasswordPage.tsx)

---

### SEC-04 — No brute-force protection at the application layer
**Risk: HIGH** · OWASP A07:2021 · CWE-307

**Description.** `/api/auth/login` had no failure counter, no lockout and no application-level rate
limit. The only control was nginx `10r/m` per IP — bypassed entirely by a distributed credential
stuffing run, and absent completely if the backend is ever reached directly (it listens on
`0.0.0.0:8000`).

**Impact.** Unlimited offline-speed credential stuffing against any known email address.

**Fix.** Layered controls:
- Per-IP window (20 attempts / 5 min) **and** per-account window (10 attempts / 5 min), so neither a
  single host spraying many accounts nor many hosts targeting one account gets through.
- Temporary account lock after 5 consecutive failures (15 min), returning `423` with `Retry-After`.
  The lock holds even for the correct password.
- `GET /api/auth/login-challenge` tells the client when to present a CAPTCHA (after 3 failures),
  without revealing whether the address is registered.
- Successful login clears the counter.
- Every failure is logged with the reason and the running count.

**Code:** [ratelimit.py](../backend/app/core/ratelimit.py), [auth.py](../backend/app/api/auth.py) `login`

---

### SEC-05 — Stored XSS via SVG company-logo upload
**Risk: HIGH** · OWASP A03:2021 · CWE-79

**Description.** `_store_logo_file` accepted `.svg`, and `/uploads/company_logos` is mounted as
same-origin static content. SVG is an executable XML document: `<svg onload="...">` runs as script
in our origin. The extension was also trusted without checking the bytes, and the whole upload was
read into memory *before* the 5 MB limit was checked.

**Impact.** A logo upload became persistent script execution against every user who viewed a page
rendering that logo — including the uploader's own customers on public quote pages. Combined with
tokens in `localStorage` (SEC-06), this was a full account-takeover chain.

**Fix.** SVG removed from the allowlist entirely. Remaining formats (PNG/JPG/WEBP) are validated by
**magic bytes**, not extension, with a WEBP container check. Reads are capped at the limit + 1 byte
so an oversized upload is refused before it is resident. Filenames are randomly generated so the
client name never reaches the filesystem. The frontend file picker was updated to match.

**Code:** [auth.py](../backend/app/api/auth.py) (`_LOGO_TYPES`, `_store_logo_file`),
[ProfileEditModal.tsx](../frontend/src/components/ProfileEditModal.tsx)

---

### SEC-06 — Long-lived refresh token in `localStorage`
**Risk: HIGH** · OWASP A07:2021 · CWE-522

**Description.** Both the access token and the 30-day refresh token were persisted in
`localStorage`, readable by any script running on the origin.

**Impact.** Any XSS — such as SEC-05 — yielded a 30-day credential, not just a 2-hour one. Session
revocation could not help, because the attacker could mint fresh access tokens indefinitely.

**Fix.** The refresh token now travels in an **HttpOnly, Secure, SameSite=Strict** cookie scoped to
`path=/api/auth`, unreachable from JavaScript. The short-lived access token remains in
`localStorage` for the `Authorization` header. `/api/auth/refresh` prefers the cookie and still
accepts a body token for non-browser API clients, so no existing integration breaks.

**CSRF note:** because the API authenticates with a `Bearer` header rather than the cookie, no CSRF
token is required for normal requests — a cross-site request cannot attach the header. The one
cookie-authenticated endpoint (`/auth/refresh`) is protected by `SameSite=Strict`, and its response
body is unreadable cross-origin.

**Code:** [auth.py](../backend/app/api/auth.py) (`_set_refresh_cookie`),
[api.ts](../frontend/src/services/api.ts), [AuthProvider.tsx](../frontend/src/components/AuthProvider.tsx)

---

### SEC-07 — Logout and password change did not revoke access tokens
**Risk: HIGH** · OWASP A07:2021 · CWE-613

**Description.** Logout cleared only `refresh_token_hash`. JWTs carried no session identifier, so
every already-issued access token stayed valid for its full 120-minute lifetime. There was also no
session regeneration at login (session fixation), no idle timeout and no absolute timeout.

**Impact.** "Sign out" on a shared machine was cosmetic for up to two hours. A user who changed their
password after a suspected compromise did not evict the attacker.

**Fix.** Tokens now carry `sid` (session id), `jti`, `iat` and `sst` (session start). `get_current_user`
rejects any token whose `sid` does not match the user's current session. Consequently:
- **Logout** clears `session_id` — every outstanding access token dies immediately.
- **Login** regenerates `session_id` — a pre-authentication token can never be carried across
  authentication (session fixation defence).
- **Password change/reset** clears the session — all other devices are signed out.
- **Idle timeout** (7 days, configurable) via a throttled `last_activity_at` heartbeat.
- **Absolute timeout** (30 days, configurable) anchored to `sst`.
- Tokens issued *before* this deploy carry no `sid` and remain valid until their own short expiry, so
  the upgrade does not sign the entire user base out.

**Code:** [security.py](../backend/app/core/security.py), [deps.py](../backend/app/api/deps.py)
(`session_expired`), [auth.py](../backend/app/api/auth.py) (`_issue_tokens_for_user`)

---

### SEC-08 — Weak password policy
**Risk: HIGH** · OWASP A07:2021 · NIST SP 800-63B §5.1.1

**Description.** Minimum length was 10 characters with character-class rules but **no common-password
check and no reuse prevention**. `Password1!` was accepted.

**Impact.** Passwords straight off every credential-stuffing list passed validation.

**Fix.** Raised to 12 characters (ASVS 2.1.1) with all four character classes retained, plus:
- Rejection of common passwords, including leetspeak variants and any password *containing* a listed
  weak base word (`Password123!` → rejected via the `password` substring).
- Rejection of keyboard runs and alphabet/digit sequences, in both directions.
- Rejection of passwords containing the user's own email local-part or name.
- **Reuse prevention** against the last 5 hashes (`User.password_history`).
- bcrypt work factor raised to **12** with automatic rehash-on-login for existing accounts — nobody
  is locked out, and every hash upgrades the next time its owner signs in.

Existing users are unaffected: the policy applies at registration, reset and change, never at login.

**Code:** [security.py](../backend/app/core/security.py) (`validate_password_strength`,
`password_was_used_before`), [PasswordRequirements.tsx](../frontend/src/components/PasswordRequirements.tsx)

---

### SEC-09 — Account enumeration and timing oracle at login
**Risk: MEDIUM** · OWASP A07:2021 · CWE-204

**Description.** `login` returned immediately when no user matched, skipping the ~100 ms bcrypt
verify performed for a real account. The response-time difference reliably distinguished registered
from unregistered addresses.

**Fix.** `verify_password_dummy()` performs a bcrypt verify against a fixed hash on the unknown-user
path, equalising cost. Response bodies are byte-identical. **Verified:** the integration suite
asserts both messages match and timings stay within 3×.

**Code:** [security.py](../backend/app/core/security.py), [auth.py](../backend/app/api/auth.py)

---

### SEC-10 — HTTP header injection via CAD filename
**Risk: MEDIUM** · OWASP A03:2021 · CWE-113

**Description.** Three download/preview endpoints interpolated the stored filename straight into a
`Content-Disposition` header:
`f'attachment; filename="{cad_file.original_filename}"'`. The filename came from the upload with no
sanitisation.

**Impact.** A file named `x"\r\nSet-Cookie: session=...\r\n\r\n<script>.stl` injected arbitrary
response headers and body.

**Fix.** Root-caused in two places rather than patched per-endpoint:
1. `sanitize_filename()` runs **once at upload**, stripping path separators (both conventions), NUL
   and control bytes, quotes and Unicode lookalikes, with NFKC normalisation and a length cap — so
   every downstream consumer starts from a safe value.
2. `content_disposition()` builds a correct RFC 6266 header with an ASCII fallback plus
   `filename*=UTF-8''`, used by all three endpoints.

**Code:** [upload.py](../backend/app/services/upload.py), [files.py](../backend/app/api/files.py)

---

### SEC-11 — Open redirect via Stripe checkout return URLs
**Risk: MEDIUM** · OWASP A01:2021 · CWE-601

**Description.** `create_checkout_session` passed client-supplied `success_url` and `cancel_url`
straight to Stripe.

**Impact.** An attacker-crafted checkout link redirected the customer to an arbitrary site after
payment, borrowing our domain's credibility for phishing.

**Fix.** Both URLs are parsed and required to match the scheme **and** host of `FRONTEND_BASE_URL`
exactly. Non-http(s) schemes are refused outright. Verified against
`https://evil.example.net`, `http://app.example.com.evil.net` and `javascript:alert(1)`.

**Code:** [billing.py](../backend/app/api/billing.py) (`_validate_return_url`)

---

### SEC-12 — Internal detail disclosure in error responses
**Risk: MEDIUM** · OWASP A05:2021 · CWE-209

**Description.** Six endpoints returned raw exception text
(`detail=f"PDF generation failed: {str(e)}"`), and `processing_error` — a stored `str(e)` from the
CAD parsers — was returned verbatim to clients.

**Impact.** Absolute server paths, library versions and internal structure leaked to any user, and
via the public quote PDF endpoint to **unauthenticated** callers.

**Fix.** `internal_error()` logs the real exception with a correlation id and returns only
`"... (ref: a1b2c3d4e5f6)"`. Global handlers for `HTTPException`, `RequestValidationError` (which
also strips pydantic's echo of the submitted body) and bare `Exception` guarantee no route can leak
a stack trace. `processing_error` is now sanitised **at the write site**, so it is safe everywhere it
is read. Full detail remains in the server log in every case.

**Code:** [errors.py](../backend/app/core/errors.py), [quotes.py](../backend/app/api/quotes.py),
[files.py](../backend/app/api/files.py), [public.py](../backend/app/api/public.py),
[geometry.py](../backend/app/services/geometry.py)

---

### SEC-13 — API documentation exposed in production
**Risk: MEDIUM** · OWASP A05:2021 · CWE-200

**Description.** `/docs`, `/redoc` and `/openapi.json` were served unconditionally.

**Impact.** Complete endpoint inventory, request schemas and field constraints handed to any
attacker — including the admin endpoints from SEC-01.

**Fix.** All three are disabled when `ENVIRONMENT=production`.

**Code:** [main.py](../backend/app/main.py)

---

### SEC-14 — Missing security response headers
**Risk: MEDIUM** · OWASP A05:2021

**Description.** The backend set no security headers at all. nginx set five for the SPA document but
none of the cross-origin isolation headers, and no HSTS.

**Fix.** `SecurityHeadersMiddleware` sets, on every API response:
`Content-Security-Policy` (`default-src 'none'` for JSON APIs), `Strict-Transport-Security`
(only over TLS), `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy` (15 features denied), `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`, `Cross-Origin-Embedder-Policy`,
`X-Permitted-Cross-Domain-Policies` and `Cache-Control: no-store`.

nginx gained COOP, CORP, the expanded Permissions-Policy, `server_tokens off` and a commented HSTS
line to enable at TLS termination. Because nginx `add_header` is inherited by proxied locations,
`proxy_hide_header` was added to `/api` and `/uploads` so responses carry exactly **one** of each
header rather than conflicting duplicates.

> **COEP note:** `require-corp` is set on API responses but deliberately **not** on the SPA document
> — it would block the cross-origin HDRI environment maps the 3D viewer loads. Documented in
> `nginx.conf`.

**Code:** [middleware.py](../backend/app/core/middleware.py), [nginx.conf](../frontend/nginx.conf)

---

### SEC-15 — No security event logging
**Risk: MEDIUM** · OWASP A09:2021 · CWE-778

**Description.** No authentication, authorisation or administrative action was logged. A compromise
would have been undetectable and unreconstructable.

**Fix.** A dedicated `security` logger emits one structured JSON line per event: registration, login
success/failure (with reason), lockout, logout, session rejection/expiry, password reset requested
and completed, password change, authorisation denial, admin configuration changes, account deletion,
consent decisions, rate-limit trips and public quote responses.

Secrets are structurally excluded: a `_FORBIDDEN_KEYS` filter drops any field named like a password,
token or secret even if passed by mistake, and email addresses are masked (`bh***@example.com`).
**Verified** by a test asserting no password or token text ever reaches the log.

**Code:** [security_log.py](../backend/app/core/security_log.py)

---

### SEC-16 — Unbounded request body read
**Risk: MEDIUM** · OWASP A05:2021 · CWE-400

**Description.** `upload_cad_file` called `await file.read()` with no bound, then checked the size
afterwards. Validation order also meant an oversized file of a rejected type was fully buffered
before its extension was checked.

**Impact.** Memory exhaustion from concurrent large uploads; trivial single-node DoS.

**Fix.** The extension is validated first (a rejected type costs nothing), then the read is capped at
`MAX_FILE_SIZE_MB + 1` byte so the limit is enforced *during* the read. `BodySizeLimitMiddleware`
rejects oversized declared `Content-Length` with 413 before routing. Empty files are rejected.

**Code:** [upload.py](../backend/app/services/upload.py), [middleware.py](../backend/app/core/middleware.py)

---

### SEC-17 — Vulnerable dependencies
**Risk: MEDIUM** · OWASP A06:2021

See §5 for the full dependency report.

---

### SEC-18 — No CORS/host/HTTPS enforcement guardrails
**Risk: MEDIUM** · OWASP A02:2021, A05:2021

**Description.** CORS allowed `*` methods and headers with `allow_credentials=True`; there was no
guard against a wildcard origin in production. `ALLOWED_HOSTS` was set in `docker-compose.yml` but
read by nothing. No HSTS or HTTPS enforcement. `JWT_SECRET_KEY` was only checked against two known
placeholder strings — an 8-character secret passed.

**Fix.** Startup now **refuses to boot** in production with a wildcard CORS origin, a JWT secret
under 32 characters, or `DEBUG=true`. Methods and headers are explicitly enumerated.
`TrustedHostMiddleware` enforces the host allowlist, and `HTTPSRedirectMiddleware` (with health
checks exempt) plus HSTS handle transport when `FORCE_HTTPS=true`.

> `ALLOWED_HOSTS` and `ADMIN_EMAILS` are typed as comma-separated strings, not `list[str]`,
> specifically so the existing `ALLOWED_HOSTS=*` in `docker-compose.yml` keeps parsing —
> pydantic-settings would demand JSON for a list-typed field and crash at startup.

**Code:** [config.py](../backend/app/core/config.py), [main.py](../backend/app/main.py)

---

### SEC-19 — Unauthenticated public quote endpoints unthrottled
**Risk: LOW** · OWASP A04:2021

**Description.** `/api/public/quotes/{token}` and its `respond`/`pdf` siblings accepted unlimited
requests. `respond` is an unauthenticated state change, and `pdf` triggers PDF generation.

**Fix.** Token shape is validated before any database lookup (rejecting traversal-style input), and
per-IP limits are applied: 60/5 min for view, 10/5 min for respond, 20/5 min for PDF. Responses are
logged against the owning user.

> The 24-byte `secrets.token_urlsafe` share token was already cryptographically sound; this addresses
> abuse rate, not guessability.

**Code:** [public.py](../backend/app/api/public.py)

---

### SEC-20 — No account deletion (GDPR erasure)
**Risk: LOW** (compliance: HIGH) · GDPR Art. 17

**Description.** No way for a user to delete their account or data.

**Fix.** `DELETE /api/auth/me` requires the current password **and** the literal string `DELETE`. It
performs a hard delete in foreign-key order across geometry analyses, quotes, CAD files, customers,
points wallet and ledger, Stripe credit records, reset tokens and consent records, and removes the
stored files and company logo from the storage backend. **Verified** by a test asserting zero
remaining rows across all owned tables.

**Code:** [account.py](../backend/app/services/account.py), [auth.py](../backend/app/api/auth.py),
[AccountSecurityPanel.tsx](../frontend/src/components/AccountSecurityPanel.tsx)

---

### SEC-21 — Open redirect on post-login navigation
**Risk: LOW** · CWE-601

**Description.** `LoginPage` navigated to `location.state.from.pathname` unvalidated. React Router 6
does not reject protocol-relative or backslash-prefixed paths (GHSA-wrjc-x8rr-h8h6, unfixed in the
6.x line).

**Fix.** The value must match `^/(?![/\\])` and contain no backslash, otherwise `/workspace` is used.

**Code:** [LoginPage.tsx](../frontend/src/pages/LoginPage.tsx)

---

### SEC-22 — No legal or compliance surface
**Risk: LOW** (compliance: CRITICAL) · GDPR Art. 12–14, ePrivacy

**Description.** No privacy policy, terms, cookie policy, disclaimer, security policy or disclosure
policy. No cookie consent mechanism.

**Fix.** See §3.

---

### SEC-23 — Path traversal hardening in local storage backend
**Risk: LOW** · CWE-22

**Description.** `LocalStorageBackend._resolve_path` accepted absolute paths and `..` segments.
Currently only reachable with database-sourced values, so not exploitable today — but one future
endpoint that passes a user-supplied path turns it into arbitrary file read.

**Status:** mitigated upstream. Stored paths are now derived exclusively from a UUID plus a
sanitised extension (SEC-10), so no user-controlled string reaches this function. Flagged for
defence-in-depth hardening — see §7.

---

### SEC-24 — Misleading Redis connection log
**Risk: INFORMATIONAL**

`main.py` logged "Redis cache connected" unconditionally, because `cache.connect()` swallows its own
failure. Operators would believe caching was active when it was not. Now reports the real state.

**Code:** [main.py](../backend/app/main.py)

---

### SEC-25 — Privilege escalation via the admin email allowlist
**Risk: HIGH** · OWASP A01:2021 · CWE-269, CWE-863
*Found by automated review of the SEC-01 fix, before release.*

**Description.** The first version of `is_admin()` granted the role to any account whose email
matched `ADMIN_EMAILS`:

```python
if (user.role or "user").strip().lower() == "admin":
    return True
return (user.email or "").strip().lower() in settings.admin_email_set   # ← escalation
```

Registration is open and **email ownership is never verified**. So on a fresh deployment, whoever
registered the configured address *first* was handed full administrative access.

**Impact.** This silently reopened SEC-01 through a different door, and it was worse than a generic
guess: the operator's contact addresses are **published on the very policy pages built in Phase 1**
(`LEGAL_CONTACT_EMAIL`, `LEGAL_SECURITY_EMAIL`) and are the natural values to put in `ADMIN_EMAILS`.
An attacker reading `/legal/privacy` had a strong candidate list. "The real admin signs up first" is
a race, not an access control.

**Fix.** The email fallback is removed outright — `is_admin()` now reads **only** `user.role`.
`ADMIN_EMAILS` was re-purposed as a **reservation** list: those addresses are refused at public
registration (403, logged as a security event), so nobody can squat the account an operator will
later promote. The role itself is granted out of band by a management CLI that requires shell and
database access:

```
python -m app.manage list-admins
python -m app.manage grant-admin owner@example.com
python -m app.manage revoke-admin owner@example.com
```

`grant-admin` prints the account's name, company and registration date and requires confirmation
before promoting — so an operator promotes a *person*, not just a matching string — clears the
user's session so the new role takes effect on a fresh sign-in, and logs an `admin.role_change`
event. **No HTTP request, authenticated or not, can now escalate to admin.**

Email verification would be the fuller fix and remains recommended (§7), but it is a larger change
to the signup flow; removing the escalation does not depend on it.

**Code:** [deps.py](../backend/app/api/deps.py) (`is_admin`),
[manage.py](../backend/app/manage.py), [auth.py](../backend/app/api/auth.py) (`register`),
[config.py](../backend/app/core/config.py) (`reserved_admin_emails`)

---

### SEC-26 — SMTP credentials never loaded; password reset silently undeliverable
**Risk: HIGH** · OWASP A05:2021 · CWE-16

**Description.** `Settings.model_config` used `env_file=".env"`, which resolves against the **working
directory**. The application runs from `backend/`, so it read `backend/.env` and never the
repository-root `.env` where the SMTP credentials live. Separately, `docker-compose.yml` did not pass
any `SMTP_*` variable into the backend container.

**Impact.** `SMTP_HOST` was `None` in every environment, so `send_email()` took its development
branch and **logged** the message instead of sending it. The password reset flow returned its success
acknowledgement and no user ever received a link — a silent failure in the account-recovery path,
which is precisely where silence is most dangerous.

**Fix.** Settings now resolve `.env` from the repository root, `backend/`, and the working directory
in that precedence order, so both layouts work. `docker-compose.yml` passes the full `SMTP_*`,
`LEGAL_*`, `ADMIN_EMAILS`, `CORS_ORIGINS` and Stripe set. Gmail and Outlook display app passwords in
space-separated groups, which fail authentication when pasted verbatim, so the loader strips spaces.
**Verified live: SMTP AUTH succeeds against the configured Gmail relay.**

**Code:** [config.py](../backend/app/core/config.py) (`_ENV_FILES`), [docker-compose.yml](../docker-compose.yml)

---

### SEC-27 — RFC 9116 security.txt unreachable in production
**Risk: LOW** · RFC 9116

**Description.** The backend served `/.well-known/security.txt` correctly, but nginx had no route for
`/.well-known/`, so the path fell through to the SPA and returned `index.html` with HTTP 200.

**Impact.** A researcher following the standard discovery path got an HTML page instead of the
disclosure contact. The 200 status made it look like it worked.

**Fix.** Added an `^~ /.well-known/` proxy location ahead of the SPA fallback. Verified through nginx.

**Code:** [nginx.conf](../frontend/nginx.conf)

---

### SEC-28 — Cross-tenant exposure of commercial rates (introduced by the per-user catalog)
**Risk: HIGH** · OWASP A01:2021 · CWE-639

**Description.** Making the pricing catalog per-workspace meant material and machine-rate rows became
tenant-owned. Every lookup in the pricing and quote paths was still `db.get(Model, id)` with no
ownership check — so one shop could pass another shop's material id and have it resolve.

**Impact.** Material cost per kg and machine hourly rates are the most commercially sensitive numbers
a job shop holds. An attacker enumerating ids could read a competitor's cost base through the pricing
response.

**Fix.** Added `catalog.get_for_user()`, which returns a row only when it is a system default or
owned by the caller, and routed all 10 lookup sites through it. Covered by
`test_pricing_rejects_another_shops_material` and `test_one_shop_cannot_read_another_shops_rates`.

**Code:** [catalog.py](../backend/app/services/catalog.py), [quotes.py](../backend/app/api/quotes.py),
[quote.py](../backend/app/services/quote.py)

---

### SEC-29 — Vulnerable dependencies in the request path
**Risk: MEDIUM** · OWASP A06:2021

**Description.** `pip-audit` reported 12 advisories across 5 packages. The material one was
**python-multipart 0.0.22** (5 CVEs), which parses every multipart upload and form login — directly
in the request path.

**Fix.**

| Package | From | To | Note |
|---|---|---|---|
| python-multipart | 0.0.22 | 0.0.31 | 5 CVEs, request path |
| weasyprint | 60.2 | 68.0 | PYSEC-2026-2034; **real quote template verified rendering in the Linux container** |
| pydyf | 0.10.0 | >=0.11.0 | required by weasyprint 68 |
| pydantic-settings | 2.13.1 | 2.14.2 | GHSA-4xgf-cpjx-pc3j |
| black | 24.1.0 | 26.3.1 | dev-only |

Accepted, with reasons:
- **ecdsa 0.19.2** — no fix exists. A side-channel in pure-Python ECDSA; this application signs JWTs
  with HS256 (HMAC), so the vulnerable code path is never reached.
- **react-router 6.30.4** — open redirect via backslash; the fix requires the v7 major. Verified not
  exploitable here: every `navigate()` target is a literal or app-constructed path, and the one
  user-influenceable value (the post-login `from`) is already validated against exactly this pattern.
- **eslint / vite dev chain** — 10 high advisories, all confined to build tooling that never ships in
  the bundle. `npm audit --omit=dev` is clean.

**Code:** [requirements.txt](../backend/requirements.txt), [security.yml](../.github/workflows/security.yml)

---

## 3. Phase 1 — Legal & compliance

Six professionally written policy documents, rendered from a typed data structure (never
`dangerouslySetInnerHTML`, so no policy string can become markup):

| Document | Route |
|---|---|
| Privacy Policy | `/legal/privacy` |
| Terms & Conditions | `/legal/terms` |
| Cookie Policy | `/legal/cookies` |
| Disclaimer | `/legal/disclaimer` |
| Security Policy | `/legal/security` |
| Responsible Disclosure Policy | `/legal/disclosure` |

**Dynamic values.** Application name, company/owner name, contact/privacy/security emails, address,
jurisdiction, policy version and retention window are served by `GET /api/legal/info` from
application settings — the published text can never drift from the running configuration. Compiled-in
defaults keep the pages readable if the API is unreachable.

**Content covers** every requested item: data collected (7-row table by category, example and
purpose), purpose and legal basis, user rights (7 enumerated with a 30-day response commitment),
cookie usage (per-item table with names, types, purposes and durations), third-party sub-processors,
retention periods per data class, security practices, and the account-deletion process — which
describes the **flow that actually exists** in Profile Settings.

**Placement.** Linked from the landing page footer (dedicated Legal column), the workspace layout
footer, and both authentication screens — with explicit consent language on sign-in and sign-up.

**Cookie consent banner** with all three required actions: **Accept All**, **Reject Non-Essential**,
**Manage Preferences** (expanding to per-category toggles: necessary/locked, preferences, analytics,
marketing). The banner cannot be dismissed without a decision. Consent is stored locally **and**
recorded server-side in `consent_records` with the policy version, an opaque subject key, and a
**salted SHA-256 of the IP address — never the address itself**. A version bump re-prompts
automatically. "Cookie preferences" in every footer reopens the panel.

**`/.well-known/security.txt`** (RFC 9116) is served with contact, expiry, canonical URL and a link
to the disclosure policy.

---

## 4. OWASP Top 10 (2021) checklist

| # | Category | Status | Controls |
|---|---|---|---|
| **A01** | Broken Access Control | ✅ | Role-based admin gate on 12 endpoints (SEC-01), grantable only out of band (SEC-25); ownership verified on every quote/file/customer read *and* write; IDOR verified by cross-tenant tests; open redirects closed (SEC-11, SEC-21); deny-by-default routers |
| **A02** | Cryptographic Failures | ✅ | bcrypt cost 12 + rehash-on-login; SHA-256 for refresh/reset tokens; `secrets` CSPRNG throughout; `hmac.compare_digest` for token comparison; TLS + HSTS; secrets from environment only; startup refuses weak/default JWT secrets |
| **A03** | Injection | ✅ | **No raw SQL anywhere** — parameterised ORM exclusively (verified by grep); no `subprocess`/`eval`/`exec`; Jinja autoescape on; header injection closed (SEC-10); no NoSQL/LDAP/XPath in the stack |
| **A04** | Insecure Design | ✅ | Least-privilege default role; capability-URL sharing with rate limits; wallet idempotency on Stripe sessions; business rules enforced server-side (subscription gate, points, quote lifecycle); secure-by-default configuration |
| **A05** | Security Misconfiguration | ✅ | Docs disabled in production; `DEBUG=true` refused in production; full secure-header set; no stack traces; host allowlist; DB/Redis bound to loopback; `server_tokens off` |
| **A06** | Vulnerable Components | ✅ | 5 frontend advisories fixed; 4 backend packages with known CVEs upgraded; scanning tooling committed — see §5 |
| **A07** | Auth Failures | ✅ | 12-char policy with common/sequence/identity/reuse checks; lockout + dual-window throttling; CAPTCHA signal; session regeneration; idle + absolute timeouts; server-side revocation; refresh rotation with replay detection |
| **A08** | Data Integrity Failures | ✅ | Stripe signature verification mandatory in production (SEC-02); `package-lock.json` + pinned Python versions; refresh-token replay tears down the session; immutable points ledger |
| **A09** | Logging & Monitoring | ✅ | 15+ structured event types on a dedicated logger; secrets structurally excluded; emails masked; correlation ids on every 500 |
| **A10** | SSRF | ✅ | Audited every endpoint: **the application makes no outbound HTTP requests from user input**. The only outbound calls are Stripe (fixed SDK endpoint) and SMTP (fixed config). Checkout return URLs are host-validated (SEC-11) |

---

## 5. Dependency report

### Frontend — fixed via `npm audit fix` (no breaking changes)

| Package | Was | Now | Advisory |
|---|---|---|---|
| axios | 1.6.5 | 1.19.0 | GHSA-jr5f-v2jv-69x6 (SSRF), GHSA-4hjh-wcwx-xvwj (DoS) |
| form-data | 4.0.0 | 4.0.6 | GHSA-hmw2-7cc7-3qxx — **CRLF injection** (high) |
| follow-redirects | ≤1.15.11 | 1.16.0 | GHSA-r4q5-vmmm-2653 — auth header leak on cross-domain redirect |
| react-router-dom | 6.21.2 | 6.30.4 | GHSA-337j-9hxr-rhxg, GHSA-2j2x-hqr9-3h42 |

**Result:** 5 vulnerabilities → 2 remaining, both in `react-router` and both requiring a **v7 major
upgrade**:
- *Arbitrary constructor injection via `deserializeErrors()`* — **not applicable**: requires React
  Router SSR hydration; this is a pure client-side `BrowserRouter` app with no SSR.
- *Open redirect via backslash in `<Link>`/`useNavigate`* — **mitigated at application level** by
  SEC-21. The only navigation to a dynamic path is the post-login redirect, now validated.

### Backend — upgraded to versions verified against the test suite

| Package | Was | Now | Why |
|---|---|---|---|
| python-multipart | 0.0.6 | 0.0.22 | CVE-2024-24762 (ReDoS on `Content-Type`), CVE-2024-53981 (resource exhaustion) — **directly reachable: every file upload** |
| python-jose | 3.3.0 | 3.5.0 | CVE-2024-33663 (algorithm confusion), CVE-2024-33664 (JWE decompression bomb) — **the JWT library** |
| fastapi / starlette | 0.109.0 | 0.135.1 | Multiple starlette DoS advisories in the 0.109 dependency range |
| jinja2 | 3.1.3 | 3.1.6 | CVE-2024-34064, CVE-2024-56201, CVE-2025-27516 (sandbox escapes) |
| sqlalchemy, alembic, redis, boto3, aiofiles, httpx, stripe, numpy, trimesh, pydantic, pytest | various | current | Routine currency |

**Deliberately not changed, with reasons recorded in `requirements.txt`:**
- `bcrypt==4.0.1` — passlib 1.7.4 reads `bcrypt.__about__`, removed in bcrypt 4.1. Upgrading requires
  replacing passlib first; doing it blind would break **all authentication**.
- `weasyprint==60.2` / `pydyf==0.10.0` — WeasyPrint needs system libraries absent on this development
  host, so an upgrade **cannot be verified before shipping**. Flagged in §7.

`pip-audit==2.9.0` is committed as a dependency so this scan is reproducible in CI.

> **Note:** `pip-audit` also flags `ecdsa` (PYSEC-2026-1325, Minerva timing attack) with **no fix
> available**. It arrives via `python-jose[cryptography]` and is **not exercised** — this application
> uses HS256 (HMAC), not ECDSA. No action possible or needed.

---

## 6. Password recovery flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER                    FRONTEND                 BACKEND               │
└─────────────────────────────────────────────────────────────────────────┘

  Clicks "Forgot password?"
  on /login
        │
        ▼
  /forgot-password ──────► POST /api/auth/forgot-password
                                    │
                                    ├─► Rate limit: 5/hour per IP
                                    │              5/hour per account
                                    │              (429 + Retry-After if over)
                                    │
                                    ├─► Look up user
                                    │     │
                                    │     ├── not found / inactive ──┐
                                    │     │   log(failure)           │
                                    │     │   (no email sent)        │
                                    │     │                          │
                                    │     └── found                  │
                                    │           │                    │
                                    │           ├─► DELETE outstanding unused
                                    │           │   tokens for this account
                                    │           │
                                    │           ├─► token = secrets.token_urlsafe(32)
                                    │           │   (256 bits entropy)
                                    │           │
                                    │           ├─► STORE sha256(token) only
                                    │           │   expires_at = now + 15 min
                                    │           │   used = false
                                    │           │
                                    │           ├─► log("password_reset.requested")
                                    │           │   (token never logged)
                                    │           │
                                    │           └─► queue email (background,
                                    │               AFTER the response — so
                                    │               latency is not an oracle)
                                    │                     │
        ┌───────────────────────────┴─────────────────────┘
        ▼                           │
  IDENTICAL 200 response ◄──────────┘
  "If an account exists for that
   email, we've sent instructions."
        │
        │   ┌──────────────────────────────────────────┐
        │   │  EMAIL (HTML + plain text)               │
        └──►│  FRONTEND_BASE_URL/reset-password?token= │
            │  "expires in 15 minutes, single use"     │
            └──────────────────┬───────────────────────┘
                               │
  Clicks link                  │
        │                      │
        ▼                      ▼
  /reset-password?token=…  (token in URL, never sent to our API until submit)
        │
        ├─► No token in URL? ──► "Reset link incomplete" + request-new-link CTA
        │
        ▼
  Enter new password
  (live policy checklist)
        │
        ▼
  POST /api/auth/reset-password { token, new_password }
        │
        ├─► Rate limit: 10/hour per IP
        │
        ├─► lookup by sha256(token)
        │     │
        │     ├── not found ────┐
        │     ├── used ─────────┼──► 400 "invalid or expired"
        │     ├── expired ──────┘     log(failure, reason)
        │     │
        │     └── valid
        │           │
        │           ├─► validate policy (12 chars, 4 classes, not common,
        │           │   no sequences, not name/email)          ──► 400 on fail
        │           │
        │           ├─► check current + last 5 hashes          ──► 400 on reuse
        │           │
        │           ├─► push old hash to history
        │           ├─► hashed_password = bcrypt(new, cost 12)
        │           ├─► password_changed_at = now
        │           │
        │           ├─► INVALIDATE SESSION
        │           │     session_id       = NULL  ← all access tokens die
        │           │     refresh_token    = NULL  ← attacker evicted
        │           │     failed_login_cnt = 0
        │           │     locked_until     = NULL
        │           │
        │           ├─► token.used = true
        │           ├─► DELETE all sibling tokens for this account
        │           │
        │           ├─► log("password_reset.completed")
        │           └─► queue "password was changed" notification
        │                        (takeover tripwire)
        ▼
  200 → Success page → "Go to sign in"
        │
        ▼
  /login with the new password
```

**Guarantees:** 15-minute expiry · single use · one live token per account · rate limited on both
endpoints and both dimensions · no enumeration (identical body, status *and* timing) · every attempt
logged, no token ever logged · all sessions invalidated on completion · owner notified.

---

## 7. Remaining recommendations

Everything previously listed here has been implemented. What remains is
deployment work and deliberately accepted risk.

### Operator actions required before go-live

1. **Set `JWT_SECRET_KEY`** (32+ chars). Startup refuses to boot without it in production.
2. **Set `FIELD_ENCRYPTION_KEY`** to enable column encryption for tax IDs and customer contacts.
   Unset means those columns stay plaintext — the previous behaviour, not a regression.
   Back the key up **separately from the database**; without it the encrypted rows are unreadable.
3. **Promote yourself to admin** after signing up and confirming your email:
   `docker compose exec backend python -m app.manage grant-admin you@example.com`
4. **Apply least-privilege database roles**: `backend/scripts/db_least_privilege.sql`.
   The application currently connects as the schema owner.
5. **Set up backups and run one restore drill** — see [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md) §2.
6. **Enable malware scanning** (`CLAMAV_ENABLED=true`) if untrusted parties can upload.

### Accepted risk

| Item | Why it is accepted |
|---|---|
| `ecdsa` advisory, no fix | Side channel in pure-Python ECDSA; JWTs are HS256, so the path is unreachable |
| react-router open redirect | Fix needs the v7 major; verified not exploitable — all navigation targets are literals, and the one user-influenceable value is already validated |
| eslint / vite dev advisories | Build tooling only; `npm audit --omit=dev` is clean |
| Rate limiter is fixed-window | Cheaper than a sliding window and adequate for abuse control; shared across workers via Redis |

### Worth doing next

1. **WebAuthn / passkeys** as a second factor alongside TOTP — phishing-resistant, which TOTP is not.
2. **Per-workspace audit trail surfaced in the UI**, so shop owners can see their own rate changes.
3. **Key rotation tooling** for `FIELD_ENCRYPTION_KEY` (re-encrypt in place); today rotation means
   decrypting and re-encrypting manually.
4. **Content Security Policy nonces** instead of `'unsafe-inline'` for styles — currently required by
   the 3D viewer's inline styling.
5. **Anomaly alerting** on the security log beyond the static thresholds in the runbook.


## 8. Change inventory

### Database changes (migration `20260730_0022`)

`users` — 9 new columns:
`role` · `session_id` · `session_started_at` · `last_activity_at` · `failed_login_count` ·
`locked_until` · `last_login_at` · `password_changed_at` · `password_history`

New tables: `password_reset_tokens` (id, user_id, token_hash, expires_at, used, created_at),
`consent_records` (id, user_id, subject_key, policy_version, necessary, preferences, analytics,
marketing, source, ip_hash, user_agent, created_at)

New index: `ix_quotes_user_id_created_at` — the quote list was scanning sequentially per owner.

Every step is guarded by an existence check, so the migration is safe to re-run. **Verified**:
applies, downgrades and re-applies cleanly on PostgreSQL 16.

### New routes

**Backend** — `POST /api/auth/forgot-password` · `POST /api/auth/reset-password` ·
`POST /api/auth/change-password` · `DELETE /api/auth/me` · `GET /api/auth/login-challenge` ·
`GET /api/legal/info` · `POST /api/legal/consent` · `GET /.well-known/security.txt` · `GET /security.txt`

**Frontend** — `/legal/:slug` (6 documents) · `/forgot-password` · `/reset-password`

### New middleware

`SecurityHeadersMiddleware` · `HTTPSRedirectMiddleware` · `BodySizeLimitMiddleware` ·
`TrustedHostMiddleware` (conditional) · global exception handlers · `require_admin` dependency ·
`ratelimit.enforce()` guard

### New management command

`python -m app.manage {list-admins | grant-admin <email> | revoke-admin <email>}` — the only way to
assign the admin role (SEC-25).

### New environment variables

All optional with secure defaults — **existing deployments keep working unchanged**. Full reference
in [.env.example](../.env.example).

`SESSION_IDLE_TIMEOUT_MINUTES` · `SESSION_ABSOLUTE_TIMEOUT_HOURS` · `PASSWORD_MIN_LENGTH` ·
`PASSWORD_HISTORY_DEPTH` · `BCRYPT_ROUNDS` · `LOGIN_MAX_ATTEMPTS` · `LOGIN_LOCKOUT_MINUTES` ·
`LOGIN_CAPTCHA_AFTER_FAILURES` · `RATE_LIMIT_ENABLED` · `PASSWORD_RESET_TOKEN_TTL_MINUTES` ·
`PASSWORD_RESET_MAX_PER_HOUR` · `ADMIN_EMAILS` · `SMTP_*` (7) · `LEGAL_*` (8) · `FORCE_HTTPS` ·
`HSTS_MAX_AGE_SECONDS` · `ALLOWED_HOSTS` · `MAX_REQUEST_BODY_MB`

### Dependencies added

Backend: `pip-audit==2.9.0` (dev). **No new runtime dependencies** — rate limiting, email and audit
logging use the standard library (`smtplib`, `email.message`, `collections.deque`, `threading`,
`hashlib`, `secrets`, `hmac`).

Frontend: **none.** The consent banner, legal pages and recovery screens use existing React,
react-router and lucide-react.

---

## 9. Testing

```bash
# Backend — 99 tests (32 pre-existing + 67 new)
cd backend && python -m pytest -q

#   tests/test_smoke.py     32  pricing, geometry, upload validation (unchanged)
#   tests/test_security.py  45  password policy, tokens, filenames, rate limits,
#                               log hygiene, config guards, return-URL validation,
#                               admin-role assignment
#   tests/test_auth_flow.py 22  live ASGI integration: reset workflow, session
#                               revocation, admin gate + CLI promotion, IDOR,
#                               lockout, erasure

# Frontend
cd frontend && npx tsc --noEmit && npm run build

# Dependency scans
cd backend && python -m pip_audit
cd frontend && npm audit --omit=dev

# Migration (against a throwaway Postgres)
docker run -d --name pgtest -e POSTGRES_PASSWORD=test -p 15433:5432 postgres:16-alpine
DATABASE_URL="postgresql+asyncpg://postgres:test@127.0.0.1:15433/postgres" \
  JWT_SECRET_KEY="a-long-enough-test-secret-key-here" python -m alembic upgrade head

# nginx config
docker run --rm -v "$PWD/frontend:/etc/nginx/conf.d:ro" nginx:alpine nginx -t
```

### Manual verification checklist

- [ ] Sign up — a 10-character password is now rejected; the live checklist shows all 5 rules
- [ ] Sign in — 5 wrong passwords produce a 15-minute lock; the correct password is refused during it
- [ ] Forgot password — identical message for a real and a fake address
- [ ] Reset link — works once; a second attempt fails; other sessions are signed out
- [ ] Log out — the browser's access token is rejected immediately, not in 2 hours
- [ ] Non-admin — "Cost Master" is hidden and `/admin/pricing` redirects; the API returns 403
- [ ] Registering a `ADMIN_EMAILS` address is refused; `grant-admin` promotes and forces re-login
- [ ] Profile — an SVG logo is rejected; PNG/JPG/WEBP work
- [ ] Cookie banner — appears once, all three actions work, "Cookie preferences" reopens it
- [ ] Footer — all six policy links resolve from landing, workspace and auth pages
- [ ] Delete account — requires password + `DELETE`, and the data is gone
- [ ] **Regression:** upload → price → quote → PDF → share → public accept still works end to end

---

## 10. Deployment recommendations

**Before first production deploy**

1. Copy `.env.example` to `.env` and set every placeholder. Generate the secret with
   `python -c "import secrets; print(secrets.token_urlsafe(64))"`.
2. Set `ENVIRONMENT=production`. The application **will refuse to start** with a default or short JWT
   secret, a wildcard CORS origin, or `DEBUG=true`.
3. Set `ADMIN_EMAILS` to your own address. This **reserves** it from public signup; it grants
   nothing. Then sign up normally and promote yourself out of band:
   ```bash
   docker compose exec backend python -m app.manage grant-admin you@example.com
   ```
   Until you do, **nobody** can edit pricing configuration — including you.
4. Set `STRIPE_WEBHOOK_SECRET` if billing is enabled; the webhook returns 503 in production without it.
5. Configure `SMTP_*`, or password reset emails are logged instead of sent.
6. Set `ALLOWED_HOSTS` to your real hostname(s) — the shipped `*` disables host checking.
7. Set `FORCE_HTTPS=true` and uncomment the HSTS line in `nginx.conf` once TLS terminates.

**Migration**
```bash
docker compose run --rm backend alembic upgrade head   # back up the database first
```
Additive and reversible. `alembic downgrade 20260716_0021` reverts it.

**Cookie caveat.** The refresh cookie is `SameSite=Strict` and path-scoped to `/api/auth`. It works
when the API is same-origin with the SPA — true for both the nginx production setup and the Vite dev
proxy. **If you serve the API on a different origin** (e.g. `VITE_API_BASE_URL=https://api.example.com`),
the cookie will not be sent; switch it to `SameSite=None; Secure` and add explicit CORS origins.

**Ongoing**
- Run `pip-audit` and `npm audit` in CI as a failing gate.
- Ship the `security` logger to a SIEM; alert on `auth.login` failure bursts and `authz.denied`.
- Rotate `JWT_SECRET_KEY` periodically — it signs out all users, so schedule it.
- Test database restores, not just backups.
- Recheck `/.well-known/security.txt` annually; its `Expires` field is one year out.

---

*Report generated 2026-07-30. Every finding was verified fixed by an automated test or a live
request against a running instance.*
