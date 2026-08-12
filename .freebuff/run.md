# SolarOps — Preview run doc

## Reproduce uncommitted artifacts

This preview runs from the main checkout (`D:\Development-SolarOps`), so no artifact copying is required:

- `node_modules/` is already installed. If it is ever missing, run `npm install` from the repo root.
- `.env.local` is already present in the worktree (contains Firebase config values; do not commit, do not paste values into docs). If it is missing from a fresh worktree, copy it from the main checkout.
- No build step is needed — the app runs via Vite dev server.

## Run the dev server

- Script: `npm run dev` (Vite 6, React 18 SPA + PWA).
- Default URL: `http://localhost:5173`.
- Port note: 5173 is commonly occupied by other threads' servers; this preview uses **5174** (`--port 5174 --strictPort`). Use the project default when free.
- Detached start (Windows) — stdout and stderr MUST go to different files:

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'npm.cmd' -ArgumentList 'run','dev','--','--port','5174','--strictPort' -RedirectStandardOutput '<log>' -RedirectStandardError '<log>.err' -WindowStyle Hidden -PassThru).Id"
```

- Verify: `powershell -NoProfile -Command "Get-Process -Id <pid>"`, then wait until `http://localhost:5174` answers.
- The app connects directly to the Firebase project configured in `.env.local` (no emulator proxy in `vite.config.ts`), so signing in and data access behave like production.
