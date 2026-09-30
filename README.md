# FELIX PANEL REMOTE
### PROJECT BY CHRIS

A futuristic (galaxy / space) admin panel for managing **users** and **music**
that are stored as JSON files inside a GitHub repository — no database, no
server-side filesystem. GitHub *is* the database. Built to run on Vercel as
a static frontend + a handful of serverless functions.

---

## 1. Why there is an `/api` folder

Every other file lives flat at the project root, exactly as requested.
The **only** exception is `/api`, and it exists for one unavoidable
technical reason:

> Your `GITHUB_TOKEN` must never reach the browser. Vercel's serverless
> functions (anything inside `/api`) are the only part of a Vercel project
> that runs on a server, with access to environment variables, instead of
> in the visitor's browser. There is no way to keep the token secret while
> also serving it from a plain static file.

So `/api` contains **only** the 7 thin HTTP handlers (`login.js`,
`dashboard.js`, `users.js`, `music.js`, `leaderboard.js`, `deploy.js`,
`settings.js`). All of the real logic — GitHub communication, file
discovery, rotation, validation — stays in the flat root files
(`github.js`, `config.js`, `utils.js`, `validation.js`) and is simply
`require("../github")`-d from inside `/api`. Nothing else was moved into
a folder.

`github.js` itself is never linked from `index.html`, so it is never sent
to the browser at all — it only exists on the server.

---

## 2. Project structure

```
package.json        Scripts (dev/build/start), no dependencies required
config.js            Shared, non-secret constants (app name, file prefixes, limits)
utils.js             Isomorphic helpers (file-index parsing, date/expiry helpers, etc.)
validation.js         Isomorphic form validation (used by both the browser forms and the API)
github.js             SERVER-ONLY. The one module that talks to the GitHub REST API.
index.html            The single HTML shell (login screen + app shell)
styles.css            Galaxy / glassmorphism / neon theme, fully responsive
app.js                 Bootstrap: canvas galaxy background, router, session, API client, toasts, modal
dashboard.js           Dashboard page (real aggregated numbers, file status)
users.js               Users page (search, add/edit/delete, rotation preview)
music.js               Music page (search, add/edit/delete, audio preview)
leaderboard.js          Leaderboard page (honest empty state until a "score" field exists)
deploy.js               Deploy Center page (status + big deploy buttons)
settings.js             Settings page (read-only info, no token)
.env.example            Template for local environment variables
.gitignore
api/
  login.js              POST   - authenticates against the GitHub-stored users
  dashboard.js          GET    - aggregated stats from every users*/music* file
  users.js              GET/POST/PUT/DELETE - list / add / edit / delete users
  music.js              GET/POST/PUT/DELETE - list / add / edit / delete music
  leaderboard.js        GET    - leaderboard (or the "no data" message)
  deploy.js             GET    - GitHub/repo/branch/file-count status
  settings.js           GET    - read-only configuration info
```

---

## 3. Installation

```bash
npm install
```

There are **no external dependencies** — the frontend is plain HTML/CSS/JS
and the API handlers use Node's built-in `fetch` (Node 18+), so
`npm install` finishes instantly.

## 4. Environment variables

Copy `.env.example` to `.env` for local development:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `GITHUB_TOKEN` | yes | A GitHub **Personal Access Token** with Contents: Read & Write on the data repository. Server-side only. |
| `GITHUB_OWNER` | yes | The GitHub username or organization that owns the data repository. |
| `GITHUB_REPO` | yes | The repository name containing `users*.json` / `music*.json`. |
| `GITHUB_BRANCH` | no (default `main`) | Branch to read from and commit to. |

`.env` is already listed in `.gitignore` — never commit it.

For local development, put each value between double quotes in `.env`:

```dotenv
GITHUB_TOKEN="your_github_token"
GITHUB_OWNER="your_github_username_or_org"
GITHUB_REPO="your_data_repository"
GITHUB_BRANCH="main"
```

On Vercel, enter the values directly in **Project → Settings → Environment
Variables** without surrounding quotes. Do not put the token in `github.js`
or `config.js`; those files are not the place for secrets.

### GitHub Token Setup
1. On GitHub: **Settings → Developer settings → Fine-grained personal access tokens → Generate new token**.
2. Resource owner: the account/org that owns your data repo.
3. Repository access: **Only select repositories** → pick your data repo.
4. Permissions: **Contents → Read and write**.
5. Generate, copy the token once, and paste it into `GITHUB_TOKEN`.

### GitHub Repository Setup
Your data repository should already contain (or will grow to contain):

```
users.json   users2.json   users3.json   users4.json   users5.json ...
music.json   music2.json   music3.json   music4.json   music5.json ...
```

Nothing else is required in that repository — FELIX PANEL REMOTE reads and
writes only files matching those two patterns at the repository root.

## 5. Local development

```bash
npm run dev
```

This runs `vercel dev`, which serves the static root files and emulates the
`/api` serverless functions locally, reading `.env` automatically. Open the
printed local URL (typically `http://localhost:3000`).

> If you don't have the Vercel CLI yet: `npm i -g vercel`, then `vercel login` once.

## 6. Build

```bash
npm run build
```

This project has no bundler step (there's nothing to compile), so `build`
is a fast no-op sanity check that always exits successfully.

## 7. Deploying to Vercel

1. Push this project to a GitHub repository (can be the same or a different
   repo from your data repository — they don't have to match).
2. In Vercel: **Add New → Project**, import that repository.
3. Framework preset: **Other** (no build command needed).
4. Under **Environment Variables**, add `GITHUB_TOKEN`, `GITHUB_OWNER`,
   `GITHUB_REPO`, `GITHUB_BRANCH` (Production **and** Preview).
5. Deploy. Vercel will automatically serve the root files as static assets
   and turn every file inside `/api` into its own serverless function —
   no `vercel.json` is required.

### Vercel Environment Variables
Set them under **Project → Settings → Environment Variables**. Redeploy
after adding/changing them (Vercel does not hot-reload env vars into
already-built deployments).

## 8. How Auto File Rotation Works

On every **Add User** / **Add Music**:

1. The server lists the real repository root and finds every file matching
   `users(\d*)\.json` / `music(\d*)\.json` (no hard-coded upper bound; a
   missing number in the middle, e.g. `users4.json` absent, is simply
   skipped rather than assumed to exist).
2. Each matching file is read fresh (latest content + latest SHA).
3. The **first** file (in ascending numeric order, where the bare filename
   counts as index 1) with fewer than 20 items is the target.
4. Only if **every** discovered file already has 20 items does the server
   create a new file, using the next never-used index
   (`max existing index + 1`) — it will not fill a gap with a guessed name
   and will not skip a file that still has room.
5. The write uses the SHA fetched in step 2. If GitHub rejects it because
   the file changed in the meantime (409/422), the whole process re-runs
   from step 1, up to 3 attempts, before returning
   *"GitHub file changed by another request. Please try again."*

## 9. How User Deployment Works

`POST /api/users` runs: scan all `users*.json` → case-insensitive duplicate
check across every file → find the first file with capacity (see above) →
append → get-latest-SHA-safe write → respond with the exact file the user
was deployed to, e.g. *"User deployed successfully to users3.json"*.
Editing and deleting a user locate it by scanning every file for a matching
`username` (the identifier never changes file) and only ever touch that
one file — other users and other files are never rewritten.

## 10. How Music Deployment Works

Identical rotation logic to users, without the duplicate check (music has
no unique identifier field). Because there's no natural unique key, editing
and deleting a music entry are addressed by `(file, index)` plus the
original `title`/`url` as a safety check — if the index has shifted since
the entry was listed, the server re-locates the exact row by matching the
original title and URL before writing.

## 11. Roles

- **Owner / Moderator** — full access: add, edit, delete users and music.
- **Member** — read-only: can view the Dashboard, Music and Leaderboard,
  but cannot add/edit/delete anything (enforced on the server, not just
  hidden in the UI).

## 12. Security notes

- `GITHUB_TOKEN` is read only inside `github.js` on the server and is
  never included in any API response, log line, or the `config.js` file
  that ships to the browser.
- There is no `NEXT_PUBLIC_GITHUB_TOKEN` and no token anywhere in the
  frontend bundle.
- Every request to `/api/*` (except `/api/login`) requires HTTP Basic
  credentials, which the server re-validates against the live GitHub data
  on every single call — nothing about "who you are" is trusted from the
  client alone.
- **Known limitation to improve for production use:** credentials are
  currently checked as plain-text matches against the `password` field
  stored in your JSON (matching the format you specified), and the browser
  keeps them in `sessionStorage` for the duration of the tab to attach to
  each request. For a production deployment with real end users, consider
  hashing passwords (e.g. bcrypt) and moving to signed, HTTP-only session
  cookies or a JWT instead of re-sending credentials on every call.

## 13. Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Server is missing GitHub configuration" | One of `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` is not set in this environment. |
| "Repository or path not found" | `GITHUB_OWNER`/`GITHUB_REPO` is wrong, or the token can't see that repo. |
| "Permission denied by GitHub" | The token lacks Contents: Read & Write on the repo. |
| "GitHub file changed by another request. Please try again." | Two deploys raced on the same file; simply retry — this message only appears after 3 automatic retries already failed. |
| "Username already exists." | A case-insensitive match for that username was found in some `users*.json` file. |
| Login fails with correct-looking credentials | The account's `active` field is `false`, or `expiresAt` is in the past. |
| Audio row shows "Unable to load audio" | The stored URL is unreachable, not audio, or blocked by the host — the player fails gracefully instead of crashing the page. |
| Leaderboard shows "No leaderboard score data available." | Expected until at least one user record has a numeric `score` field — no code change needed once you add it. |

---

Built for **FELIX PANEL REMOTE — PROJECT BY CHRIS**.
