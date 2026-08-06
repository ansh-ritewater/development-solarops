# SolarOps — Architecture Reference

**Last updated: 6 August 2026**
**Source: full read of `package.json`, `src/App.tsx`, `vite.config.ts`,
`firebase.json`, `src/firebase/config.ts`, `src/store/authStore.ts`
(plus `src/store/taskStore.ts`/`userStore.ts` and `src/hooks/useAppConfig.ts`
spot-checked for the state-management section), a full recursive
listing of `src/`, and the `scripts` block of `package.json` on this
date. This document reflects only what is confirmed in those files —
not assumption.**

## 1. Tech stack

**Runtime dependencies** (`package.json`):
- **React** `^18.3.1` + **react-dom** `^18.3.1`
- **react-router-dom** `^7.1.1` — routing
- **firebase** `^10.14.1` — the JS SDK (Auth, Firestore, Realtime
  Database — see §6)
- **zustand** `^5.0.3` — global client state (see §3)
- **Radix UI** primitives: `react-dialog`, `react-dropdown-menu`,
  `react-label`, `react-scroll-area`, `react-select`, `react-slot`
- **lucide-react** `^0.468.0` — icon set
- **recharts** `^2.15.0` — Dashboard/Reports charts
- **xlsx** `^0.18.5` — Excel export (Tasks-page export, see
  `PIPELINE_FLOW.md`-adjacent work)
- **papaparse** `^5.5.3` — CSV parsing (bulk task upload)
- **idb** `^8.0.0` — IndexedDB wrapper, backs the offline task-update
  queue (`useTaskOfflineQueue.ts`)
- **workbox-window** `^7.3.0` + **vite-plugin-pwa** `^0.21.1` — PWA /
  service-worker tooling
- **class-variance-authority**, **clsx**, **tailwind-merge** — styling
  utility trio typical of a shadcn/ui-style component setup
- **uuid** `^11.0.5`

**Dev dependencies:**
- **TypeScript** `^5.7.2`
- **Vite** `^6.0.7` + `@vitejs/plugin-react` `^4.3.4`
- **Tailwind CSS** `^3.4.17` + **postcss**/**autoprefixer**
- **sharp** `^0.35.1` — used by the `generate-icons` script, not the app itself
- `@types/*` packages for React, React DOM, papaparse, uuid

No backend framework, no Express/Next/Node server — this is a pure
Vite-built SPA talking directly to Firebase from the client.

## 2. Project structure (`src/`)

```
src/
  App.tsx            — route table + route guards (see §4)
  main.tsx           — React root / entry point
  index.css          — Tailwind entry
  lib/utils.ts        — small shared helpers (e.g. `cn()` classname merge)

  pages/             — one file per top-level route (Dashboard, Tasks,
                        Team, Template, Reports, Proposal, Backend,
                        BackendManager, ErrorLogs, Login, Signup)
  components/
    layout/          — Layout shell, Header, SideNav, BottomNav
    tasks/           — Task creation/detail/update drawers, bulk
                        upload modal, per-field-type checklist inputs
                        (tasks/checklist/*)
    pipeline/         — per-stage work drawers (Proposal/Documents/
                        Backend/FieldReview) + PipelineTracker display
    team/             — user cards, create/edit user modals, engineer
                        detail drawer
    offline/          — OfflineBanner + TaskQueueProcessor (drains the
                        IndexedDB queue when connectivity returns)
    photos/           — PhotoZone (capture/upload UI)
    ui/               — generic design-system primitives (button,
                        dialog, select, sheet, toast, comboboxes, etc.)

  hooks/             — the majority of the app's business logic lives
                        here as custom hooks (one file per concern):
                        `usePipelineActions`, `useTaskSubmit`,
                        `useTaskActions`, `useTasks`, `useProposalTasks`,
                        `useBackendTasks`, `useStageTaskList`,
                        `useAppConfig`, `useTemplateActions`,
                        `useUserActions`, `useUsers`, `useFieldEngineers`,
                        `useInviteActions`, `useBulkTaskActions`,
                        `useTeamStats`, `useEngineerTaskStats`,
                        `useAuth`, `usePresence`, `useOnlineUsers`,
                        `useNetworkStatus`, `useDrawerBackButton`,
                        `useTaskOfflineQueue`

  utils/             — pure/standalone helper functions: `taskScoring`,
                        `findLeastLoadedUser`, `computeSaleClosed`,
                        `needsResurvey`, `checkDuplicateMobile`,
                        `districtUtils`, `engineerStats`,
                        `exportTasksToExcel`, `logError`,
                        `proposalDocuments`, `proposalNoteLabel`,
                        `uploadToCloudinary`

  store/             — Zustand global stores: `authStore`, `taskStore`,
                        `userStore` (see §3)

  firebase/          — `config.ts` (SDK init) + `initAppConfig.ts`
                        (one-time setup + the admin backfill/reconcile
                        tool collection documented in `TRACKER.md`)

  types/index.ts     — all shared TypeScript types (documented in
                        `SCHEMA.md`)
```

## 3. State management

**Confirmed: Zustand**, not Redux/Context/MobX/anything else.
`useAuthStore`, `useTaskStore`, and `useUserStore` are each defined with
`create<...>((set) => ({...}))` from the `zustand` package — plain
global singleton stores, each holding a flat slice of state
(`currentUser`/`loading`/`authError` for auth; `tasks` + pagination
state for tasks; `users`/`loading` for the team list) with setter
functions alongside the state itself. `App.tsx` and page components read
these directly via the hook (e.g. `const { currentUser, loading } =
useAuthStore()`) — no Provider wrapper needed, which is the normal
Zustand pattern.

**`useAppConfig` is NOT a global store — this is worth calling out
explicitly.** It's a plain custom hook (`useState` + a Firestore
`onSnapshot` listener), and **every component that calls
`useAppConfig()` opens its own independent subscription** to the
`appConfig/global` document and keeps its own local copy of the config
in that component's state. There is no shared/cached single source of
truth — if ten components on screen each call `useAppConfig()`, that's
ten separate `onSnapshot` listeners against the same document, each
maintaining a duplicate in-memory copy. This works correctly (Firestore
's SDK-level cache means it's not ten separate network round-trips),
but it is a hook-per-call-site subscription pattern, not a
context-provided singleton — don't assume "app-wide config" implies a
single shared object in memory.

## 4. Routing (`src/App.tsx`)

Router: `react-router-dom`'s `BrowserRouter`. Auth/presence are wired up
once via an `AuthInit` wrapper (`useAuth()` + `usePresence()`) around
the whole `<Routes>` tree.

| Path | Component | Access gate |
|---|---|---|
| `/` | redirect → `/login` | — |
| `/login` | `LoginPage` | public |
| `/signup/:inviteId` | `SignupPage` | public |
| `/dashboard` | `DashboardPage` | any authenticated user (`ProtectedRoute` with no flags) |
| `/tasks` | `TasksPage` | `requireAdminOrField` — admin/view_only or field roles; proposal/backend/backend_manager/logistics/installation are redirected away (see below) |
| `/proposal` | `ProposalPage` | `requireRole="proposal"` (admin can also reach it — the guard always allows admin through in addition to the named role) |
| `/backend` | `BackendPage` | `requireRole="backend"` |
| `/backend-manager` | `BackendManagerPage` | `requireRole="backend_manager"` |
| `/coming-soon` | `ComingSoonPage` (inline stub) | reached only via the `requireAdminOrField` redirect for `logistics`/`installation` roles |
| `/team` | `TeamPage` | `requireAdmin` |
| `/template` | `TemplatePage` | `requireAdmin` |
| `/reports` | `ReportsPage` | `requireAdmin` |
| `/error-logs` | `ErrorLogsPage` | `requireAdmin` |
| `*` (catch-all) | redirect → `/dashboard` if logged in, else `/login` | — |

**`ProtectedRoute` logic, exactly as coded:**
- Shows a full-screen spinner while `loading` is true.
- No `currentUser` → redirect to `/login`.
- `requireAdmin` → allows `admin` **or** `view_only`; anyone else → `/dashboard`.
- `requireRole="X"` → allows role `X` **or** `admin`; anyone else → `/dashboard`.
- `requireAdminOrField` (used only by `/tasks`) → redirects `proposal`→
  `/proposal`, `backend`→`/backend`, `backend_manager`→
  `/backend-manager`, `logistics`/`installation`→`/coming-soon`; admin,
  view_only, and field fall through to `TasksPage` itself (not
  explicitly redirected, so they're the roles this route is actually for).

**Note:** `requireAdmin` treating `view_only` as equivalent to `admin`
for route access is confirmed here directly from the code — matches
`SCHEMA.md`'s description of `view_only` as a broad-read role.

## 5. Build & deploy

**Actual npm scripts (`package.json`):**
```json
"dev":            "vite",
"build":          "tsc -b && vite build",
"lint":           "eslint .",
"preview":        "vite preview",
"generate-icons": "node scripts/generate-icons.mjs"
```
`build` runs a full TypeScript project-reference build (`tsc -b`)
before the Vite production bundle — a type error fails the build, not
just a warning. (Note: `lint` is wired up in scripts, but as found in
an earlier session this repo has no `eslint.config.js`/`.eslintrc.*`
present, so running it currently fails with a "couldn't find config"
error — a pre-existing gap, not something this document's source files
touch.)

Vite config (`vite.config.ts`) adds: the `@` → `src/` path alias, the
PWA plugin (auto-updating service worker, `NetworkFirst` runtime
caching for Firestore/Auth endpoints, `CacheFirst` for Google Fonts),
and manual vendor chunk-splitting (`vendor-react`, `vendor-firebase`,
`vendor-ui`, `vendor-utils`) for the production bundle.

**Dev-vs-production deployment model** (fully documented in
`README.md` — summarized here for completeness, not re-investigated):
two entirely separate local folders, each its own Firebase project —
`D:\Development-SolarOps` → `development-solarops` (this repo, all
active work) and `D:\SolarOps` → `solarops-ritesolar` (real production
data). Production deployment is manual: copy the relevant files across,
verify `tsc`/build clean in the prod folder, then `firebase deploy`
explicitly — nothing automatic, no shared CI between the two. `.env.local`
and `.firebaserc` must never be copied between the two folders, since
each must keep pointing at its own Firebase project.

## 6. Firebase project structure (`firebase.json`)

Confirmed services configured:
- **`firestore`** — rules at `firestore.rules`, indexes at
  `firestore.indexes.json` (both fully documented in `SCHEMA.md`).
- **`database`** (Realtime Database) — rules at `database.rules.json`.
  **This is a real, separate service from Firestore** — `src/firebase/config.ts`
  calls `getDatabase(app)` and exports it as `rtdb`, alongside `auth`
  and the Firestore `db`. Based on the hooks that exist
  (`usePresence.ts`, `useOnlineUsers.ts`), this is almost certainly what
  backs the "N users online now" presence feature seen on the Dashboard
  — **`SCHEMA.md` does not currently mention Realtime Database at all**,
  since that document was scoped to `types/index.ts`/`firestore.rules`/
  `firestore.indexes.json` only. Worth a follow-up read of
  `database.rules.json` and the presence hooks if a fully complete
  schema reference is ever wanted.
- **`hosting`** — serves the `dist/` build output as an SPA (`rewrites:
  "**" → /index.html`), with explicit no-cache headers on `sw.js`,
  `index.html`, and `manifest.json` (so PWA updates and any manifest
  change are picked up immediately) and long-lived immutable caching
  for hashed `.js`/`.css` bundle files.
- **No `functions` key is present** — this project has **no Cloud
  Functions** configured at all. Every write, including admin
  backfills/migrations and the denormalized-counter maintenance
  documented in `PIPELINE_FLOW.md`, happens directly from client-side
  code via the Firebase JS SDK, gated only by `firestore.rules`.
- **`emulators`** — Auth (`9099`), Firestore (`8080`), Hosting
  (`5000`), Emulator UI (`4000`), `singleProject: true`. `src/firebase/config.ts`
  connects to these only when `VITE_USE_EMULATORS === 'true'` in
  `.env.local` — confirmed this flag is never set in the production
  folder, so that code path can never run against real production data.
