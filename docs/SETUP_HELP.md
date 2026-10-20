# Setup Help: running ForgeQuote on a new machine

This guide gets the full app (website, API, database, cache) running on a Windows or Mac computer. Everything runs inside Docker, so you do **not** need to install Python, PostgreSQL or Redis yourself.

Allow about 20–30 minutes. Most of that is the first Docker build.

---

## 1. Install the prerequisites

| | Windows 10/11 | macOS (Intel or Apple Silicon) |
|---|---|---|
| **Docker Desktop** | [docs.docker.com/desktop/install/windows-install](https://docs.docker.com/desktop/install/windows-install/). Accept the **WSL 2** option and restart when asked. | [docs.docker.com/desktop/install/mac-install](https://docs.docker.com/desktop/install/mac-install/). Choose the Apple-chip or Intel download to match your Mac. |
| **Git** (only for Option A) | [git-scm.com/download/win](https://git-scm.com/download/win). Keep the default settings. | Run `xcode-select --install` in Terminal, or `brew install git`. |

After installing, **open Docker Desktop and wait until it shows "Engine running"**. Then check that everything works:

- **Windows:** open **PowerShell**.
- **Mac:** open **Terminal**.

```
docker --version
docker compose version
git --version
```

Each command should print a version number.

> Give Docker at least **4 GB of memory**: Docker Desktop → Settings → Resources. The CAD-analysis libraries are large.

---

## 2. Get the project

Pick **one** of the two options.

### Option A: clone from GitHub (recommended)

The repository is `https://github.com/bhargav-1910/CADQUOTE`. If it is private, sign in when Git asks. On Windows a browser window opens; on Mac, use a GitHub personal access token as the password.

```
git clone https://github.com/bhargav-1910/CADQUOTE.git ForgeQuote
cd ForgeQuote
git checkout security/hardening-and-per-user-pricing
```

The latest work is on the `security/hardening-and-per-user-pricing` branch. Once that branch is merged, skip the `git checkout` line and stay on `main`.

To pull in later updates: `git pull`.

### Option B: copy the folder as a zip

On the **old** computer, zip the project folder **without** these items. They are large or machine-specific, and the new machine rebuilds them:

| Leave out | Why |
|---|---|
| `frontend/node_modules/` | Rebuilt inside Docker (hundreds of MB) |
| `frontend/dist/` | Build output |
| `.venv/`, `backend/venv/` | Python environments are tied to the old machine |
| `backend/uploads/` | Uploaded CAD files; copy only if you need them |
| `.git/` | Optional; keep it if you want version history |

On the new machine, unzip it, then open PowerShell or Terminal **inside** the unzipped folder: the folder that contains `docker-compose.yml`.

> **The `.env` file contains passwords and secret keys.** If you include it in the zip, send the zip only to yourself. Don't email it or put it in a shared drive. It's safer to leave it out and create a new one in step 3.

---

## 3. Create the `.env` settings file

The app reads its settings from a file called `.env` in the project root, next to `docker-compose.yml`. It is never committed to GitHub, so a fresh clone won't have one.

### 3a. Generate two random secrets

**Windows (PowerShell):** run this twice and keep both outputs:

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

**Mac (Terminal):** run this twice:

```bash
openssl rand -base64 48
```

### 3b. Create the file

Create a file named exactly `.env`: no `.txt` ending, nothing before the dot.

- **Windows:** `notepad .env`. Choose *Yes* to create it. When saving, set "Save as type" to **All files**, or Notepad will save it as `.env.txt`.
- **Mac:** `nano .env`. Paste the contents, then press `Ctrl+O`, `Enter`, `Ctrl+X`.

Paste this in. Replace the two `PASTE_…` values with your secrets and pick your own database password:

```ini
# Database
POSTGRES_USER=quote_user
POSTGRES_PASSWORD=choose-a-database-password
POSTGRES_DB=quote_db

# Login tokens: must be 32+ characters (startup refuses anything shorter)
JWT_SECRET_KEY=PASTE_FIRST_SECRET_HERE
SECRET_KEY=PASTE_SECOND_SECRET_HERE

# Where the website runs
FRONTEND_BASE_URL=http://localhost

# Optional: real password-reset emails. Leave blank and reset links are
# written to the backend log instead (fine for local use).
SMTP_HOST=
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=no-reply@localhost
SMTP_FROM_NAME=ForgeQuote
```

For every available setting, with explanations, see `.env.example` in the same folder.

> **Optional encryption key.** Setting `FIELD_ENCRYPTION_KEY` encrypts customer phone numbers and GSTINs. Generate it with `openssl rand -base64 32` (Mac), or the PowerShell line above with `48` changed to `32`. **If you lose this key, that data is unreadable forever.** Store it somewhere safe outside the project. For a local test setup, leave it out.

---

## 4. Start the app

From the project folder (same command on Windows and Mac):

```
docker compose up -d --build
```

The first run downloads and builds everything, which takes **10–20 minutes**. Later starts take seconds. On startup the backend creates the database tables and fills in the default materials, finishes and machine rates on its own; there is no separate setup step.

Check that all four parts are running:

```
docker compose ps
```

You should see `quote-postgres`, `quote-redis`, `quote-backend` and `quote-frontend`. `quote-backend` shows `(healthy)` after about a minute.

Then open:

| What | Address |
|---|---|
| **The app** | http://localhost |
| API documentation | http://localhost:8000/docs |

---

## 5. Create your account

1. Go to http://localhost and **sign up**.
   - The password must be **12+ characters** and must **not** contain any part of your name or email. If the Sign-up button seems to do nothing, look for a small red message just above it.
   - Email verification isn't required to log in. Without SMTP, the verification and reset links appear in the backend log: `docker compose logs backend`.

2. **Unlock full uploads (pro plan).** New accounts are on the free plan, which can only quote the built-in sample part. To quote your own files, run:

   ```
   docker compose exec postgres psql -U quote_user -d quote_db -c "UPDATE users SET plan='pro' WHERE email='you@example.com';"
   ```

   Use the same `POSTGRES_USER` and `POSTGRES_DB` values as in your `.env`. Log out and back in afterwards.

3. **Optional: make yourself admin**, which allows editing the shared materials and rates:

   ```
   docker compose exec backend python -m app.manage grant-admin you@example.com
   ```

---

## 6. Everyday commands

| Task | Command |
|---|---|
| Stop the app (keeps your data) | `docker compose down` |
| Start it again | `docker compose up -d` |
| Update after `git pull` or code changes | `docker compose up -d --build` |
| See backend logs | `docker compose logs -f backend` (`Ctrl+C` to exit) |
| **Wipe everything** (database, uploads) and start fresh | `docker compose down -v` |

Your data lives in Docker volumes. It survives `down` and restarts, but **`down -v` deletes it permanently**.

---

## 7. Optional: frontend development with live reload

Use this if you're editing the React code and want instant updates without rebuilding. Requires **Node.js 20** from [nodejs.org](https://nodejs.org).

1. Keep the Docker stack running (step 4). The backend stays in Docker.
2. In a second terminal:

   ```
   cd frontend
   npm install
   npm run dev
   ```

3. Open http://localhost:5173. API calls go to the Docker backend on port 8000 automatically.

Running the **backend** outside Docker isn't recommended. It needs native PDF and CAD libraries (WeasyPrint, OpenCASCADE) that are painful to install, especially on Windows. Docker handles all of that.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `Set JWT_SECRET_KEY in .env` when starting | `.env` is missing, in the wrong folder, or saved as `.env.txt`. It must sit next to `docker-compose.yml`. On Windows, check with `dir -Force`. |
| Backend keeps restarting; logs mention the JWT secret or DEBUG | The secret is shorter than 32 characters or still a placeholder. Generate a new one (step 3a). |
| `port is already allocated` / `bind: address already in use` for port **80** | Another program is using port 80: on Windows often IIS, Skype or another web server. Stop it, or change `"80:80"` to `"8080:80"` in `docker-compose.yml` and use http://localhost:8080. |
| Same error for **5432** or **6379** | A PostgreSQL or Redis is already installed and running locally. Stop that service, or uninstall it. |
| `Cannot connect to the Docker daemon` / `error during connect` | Docker Desktop isn't running. Open it and wait for "Engine running". On Windows, if it has died, quit it from the system tray and reopen. |
| **Apple Silicon Mac:** the backend build fails installing `cadquery-ocp` or `cascadio` | Build for Intel and let Docker emulate it (slower, but works): `DOCKER_DEFAULT_PLATFORM=linux/amd64 docker compose up -d --build` |
| Login page shows "Network error" after many attempts | Login and sign-up are rate-limited to 10 per minute. Wait one minute. |
| An uploaded file is stuck "processing" | Check `docker compose logs backend` for a geometry error. Very large STEP files may need more Docker memory (step 1). |
| Everything is broken and you want a clean slate | `docker compose down -v`, then `docker compose up -d --build`. This erases all local data. |
