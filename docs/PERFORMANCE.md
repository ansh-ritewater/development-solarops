# SolarOps — Performance Audit (Measured, Not Theorised)

**Measured: 10 August 2026 · Production (`solarops-ritesolar.web.app`)
· ~740–750 tasks live at time of measurement**
**Status: FINDINGS ONLY. Nothing in this document has been implemented.**

## Why this document exists

Before this audit, every performance claim about SolarOps — including
in `SCALABILITY.md` and across seven separate external AI code audits —
was **inferred from reading code**. Nobody had ever measured the
running application. This document contains the first real
measurements, and it **overturned two of the three leading hypotheses.**

The lesson is worth keeping: static analysis was exhausted at seven
tools deep. The actual answers came from Lighthouse, the Network panel,
and four targeted code reads.

## Critical context: who uses what

- **Mobile is used by Field Engineers only.** Their critical path is:
  login → task list → task detail → survey form → photo capture/upload
  → submit.
- **Admin, view_only, proposal, and backend all use desktop/laptop.**
  Dashboard, Reports, Template, and Team are desktop surfaces.

This matters for prioritisation: mobile numbers are poor but affect one
role on a specific path; desktop numbers are good on paper but hide a
real problem (see "The paint/data gap" below).

## How to reproduce these measurements

1. Chrome DevTools → **Lighthouse** tab → Mode: Navigation, Device:
   Mobile *and* Desktop, run against `/dashboard` on production.
2. Chrome DevTools → **Network** tab → throttling "Fast 4G", hard
   reload, read the summary bar (requests / transferred / resources /
   Finish).
3. Network tab → sort by **Size** descending → identifies the dominant
   payload.
4. Lighthouse report → **"View Treemap"** → toggle between "All" and
   "Unused bytes" → exact per-chunk waste.

**Note both Lighthouse runs warned:** *"The page loaded too slowly to
finish within the time limit. Results may be incomplete"* and
*"stored data affecting loading performance: IndexedDB."* **Real mobile
numbers are therefore likely worse than reported.** For clean numbers,
re-run in an incognito window.

## Headline numbers

| Metric | Mobile (Moto G Power, Slow 4G) | Desktop |
|---|---|---|
| **Performance** | **61** | **85** |
| Accessibility | 95 | 94 |
| Best Practices | 77 | 100 |
| SEO | 82 | 82 |
| First Contentful Paint | 5.7 s | 1.2 s |
| Largest Contentful Paint | 8.1 s | 1.5 s |
| Speed Index | 5.7 s | 3.0 s |
| Total Blocking Time | 0 ms* | 60 ms |
| Cumulative Layout Shift | 0.019 | 0.01 |
| **Total main-thread work** | **12.7 s** | 4.0 s |
| **Total JS execution** | **7.1 s** | 2.0 s |
| Long tasks | 20 | — |

*TBT of 0 ms alongside 20 long tasks and 12.7 s of main-thread work is
contradictory — an artifact of the truncated measurement window. Do not
treat TBT 0 as meaningful.

**Network (Fast 4G):**
- `/dashboard` — 40 requests, **3.6 MB transferred**, Finish **7.40 s**
- `/tasks` — 35 requests, 303 kB transferred, Finish 5.43 s

## ROOT CAUSE 1 — The paint/data gap (this is the actual complaint)

```
Desktop First Contentful Paint: 1.2 s  ← page appears
Desktop /dashboard Network "Finish": 7.40 s  ← data actually arrives
```

**That ~6-second gap is what users experience as "slow."** The shell
paints quickly, then people sit looking at zeros and spinners while
Firestore data streams in. Lighthouse only measures the first number,
which is exactly why desktop "scores" 85 while feeling sluggish.

Supporting evidence: desktop Speed Index is 3.0 s against a 1.2 s
paint — the screen is still visibly changing long after it first
appears.

**"Numbers load slowly" and "features load slowly" are the same single
problem, not two separate ones.**

## ROOT CAUSE 2 — A single 3.6 MB Firestore stream on every load

Network panel, `/dashboard`, sorted by size (unthrottled):
```
channel?gsessionid=EqnaCD…              3,600 kB   2.09 s  (Firestore listener)
token?key=…                                1.0 kB   391 ms
manifest.json                              0.6 kB   417 ms
accounts:lookup?key=…                      0.4 kB   1.53 s  ← Auth, blocks role resolution
documents:runAggregationQuery ×4           0.2 kB ea  46–62 ms
channel?VER=8&database=… ×several          0.1 kB ea  17–35 ms
────────────────────────────────────────────────────
40 requests · 3.6 MB transferred · Finish 6.83 s · DOMContentLoaded 574 ms
```

**That one `channel` request accounts for essentially the entire
3.6 MB.** Everything else on the page is kilobytes.

**Confirmed from code:** the shared task listener is bounded —
`useTasks.ts:186-195`, `limit(200)` via `onSnapshot`. So it streams
**200 complete task documents** per load. (`DashboardPage.tsx:383`'s
`limit(50)` is a separate "Pipeline Activity Today" query, unrelated.)

**INFERRED, not yet proven:** 3,600 kB ÷ 200 = **~18 kB per task
document.** The most likely dominant contributor is
`fields: FieldDefinition[]` — every task embeds a full snapshot of the
56-field survey template (labels, types, options arrays, sort orders),
plausibly 8–10 kB of *identical duplicated data* on all ~750 tasks.
Add `stageHistory` (capped at 50 entries) and the answer maps, and
18 kB per document is consistent.

**To confirm:** open any task document in the Firebase console and
check its actual size, or compare a task with many `fields` entries
against one with few.

**Note the design intent:** the `fields` snapshot exists deliberately,
so an admin editing the template doesn't change what an in-progress
task shows. That is correct behaviour. The fix is not to delete it —
it's `templateVersion` referencing (see P1-6).

**On the "110–111 MB resources" figure:** this is a **DevTools
accounting artifact** of the long-lived streaming connection
accumulating while open — NOT 111 MB of actual download. The real,
actionable number is 3.6 MB. Do not chase the 111 MB.

## ROOT CAUSE 2b — CONFIRMED: the template snapshot is ~half of every
task document (measured, not inferred)

**Measured directly, 5 most recent production tasks, 10 Aug 2026:**

| Task | Total bytes | fields[] | stageHistory[] | fieldAnswers |
|---|---|---|---|---|
| T-159 | 15,014 | 8,620 (57%) | 2,204 | 1,535 |
| T-158 | 21,023 | 8,620 (41%) | 4,008 | 1,716 |
| T-157 | 10,635 | 8,620 (81%) | 482 | 56 |
| T-156 | 15,021 | 8,620 (57%) | 2,546 | 1,043 |
| T-155 | 17,134 | 8,620 (50%) | 3,838 | 1,852 |
| **Average** | **15,765** | **8,620 (55%)** | 2,616 | 1,240 |

`fields[]` is **exactly 8,620 bytes on every single task** — byte-
identical, because it's the same 56-field survey template snapshot,
duplicated. Averaging 55% of each document.

**This confirms ROOT CAUSE 2's inference precisely:** the earlier
estimate (3,600 kB ÷ 200 ≈ 18 KB/task) landed almost exactly on the
measured average of 15.8 KB. If this average holds across the full
200-task listener, roughly **1.7 MB of the 3.6 MB stream on every
single page load is duplicated template data.**

**`appConfig/global` confirmed small: 14,948 bytes.** Ruled out as a
cost concern on its own. Re-frames the 13-file/6+-simultaneous-
listener finding (ROOT CAUSE — see Root Cause 6 below): the problem
was never document weight, it's redundant re-fetching of something
small, many times over.

**Note for the future:** `stageHistory[]` varies 482–4,008 bytes
across this sample and grows as a task accumulates corrections/
restarts/stage moves. Today's 15.8 KB average is closer to a floor
than a ceiling as the platform matures.

**This moves the `templateVersion` migration (P1-6) from "worth
investigating" to "confirmed, proven high-value."** Recommend
promoting it in priority given the size of the confirmed win.

## ROOT CAUSE 3 — 59.5% of all JavaScript is never executed

Lighthouse Treemap, exact figures. **376.5 KiB unused of 632.9 KiB
total.**

| Chunk | Transfer | Unused | % wasted |
|---|---|---|---|
| `vendor-utils` | 170.6 KiB (27%) | 135.2 KiB | **79%** |
| **Google Tag Manager** | 147.3 KiB (23%) | 66.0 KiB | 45% |
| `vendor-firebase` | 141.7 KiB (22%) | 50.0 KiB | 35% |
| `index-*.js` (app code) | 90.1 KiB (14%) | 75.8 KiB | **84%** |
| `vendor-react` | 50.8 KiB (8%) | 18.4 KiB | 36% |
| `vendor-ui` | 32.3 KiB (5%) | 22.5 KiB | 70% |

**Confirmed `manualChunks` config (`vite.config.ts`):**
```
vendor-react: react, react-dom, react-router-dom
vendor-firebase: firebase/app, firebase/auth, firebase/firestore,
                 firebase/storage, firebase/database
vendor-ui: 6 × @radix-ui/*, lucide-react
vendor-utils: xlsx, papaparse, recharts, zustand
```

Two findings no external audit caught:

- **Google Analytics is 23% of all JavaScript** — the second-largest
  single item, larger than the Firebase chunk in transfer bytes, and
  costing 631 ms of mobile CPU. On an internal tool with ~50 known
  employees it provides no value.
- **`firebase/storage` is bundled but never used.** Cloudinary is the
  real file backend (confirmed repeatedly across this project). Dead
  weight inside the heaviest chunk.
- **`vendor-utils` mixes concerns:** `xlsx`/`papaparse`/`recharts` are
  only needed on Reports and export paths, but `zustand` is needed
  everywhere — so this chunk cannot simply be lazy-loaded wholesale, it
  must be split.

## ROOT CAUSE 4 — Firebase SDK CPU cost dominates mobile

| | Mobile CPU | Desktop CPU |
|---|---|---|
| `vendor-firebase.js` | **4,821 ms** (4,141 ms script eval) | 1,525 ms |
| `/dashboard` (inline/app) | 904 ms | 461 ms |
| `vendor-react.js` | 550 ms | 342 ms |
| Unattributable | 5,504 ms | 1,568 ms |
| Google Tag Manager | 631 ms | — |

**The Firebase SDK alone consumes 4.8 seconds of CPU on a mid-range
Android phone** before the app can do useful work — roughly 65% of all
mobile JS execution. Same code costs 1.5 s on desktop; the phone's
slower CPU is the entire reason mobile scores 61 and desktop 85.

Currently on Firebase JS SDK **10.14.1** — two major versions behind
(12.x), which has meaningfully better tree-shaking.

Mobile main-thread breakdown: Script Evaluation 7,049 ms · Other
4,465 ms · Garbage Collection 728 ms · Style & Layout 257 ms · Script
Parsing 108 ms · Rendering 86 ms · Parse HTML/CSS 50 ms.

## ROOT CAUSE 5 — Full-size images served to field phones

**Confirmed: zero Cloudinary delivery transformations anywhere.** No
`w_`, `h_`, `q_auto`, or `f_auto` in any URL. Every photo renders at
full uploaded resolution.

The only URL manipulation found is `fl_attachment` in
`ProposalDocumentList.tsx:9-15` (forces download, unrelated to sizing).
Upload endpoints in `uploadToCloudinary.ts:90-93` are not delivery URLs.

**Exact render sites needing transformation params — 9 distinct call
sites across 6 files:**
- `src/components/photos/PhotoZone.tsx` — lines 237, 264
- `src/components/pipeline/BackendWorkDrawer.tsx` — lines 643, 780,
  948, 1080
- `src/components/pipeline/ProposalWorkDrawer.tsx` — line 528
- `src/components/tasks/TaskDetailDrawer.tsx` — line 762
- `src/pages/BackendPage.tsx` — lines 319, 394, 442
- `src/pages/ProposalPage.tsx` — line 313

All use `src={url}` with the raw `secure_url`.

**This is invisible in Lighthouse** because photos load after the
measured window — which is exactly why seven code audits and two
Lighthouse runs both missed it as a *measured* cost. For a field
engineer on mobile data it is plausibly the single largest real-world
penalty.

## ROOT CAUSE 6 — The re-render cascade (found via runtime-behavior
code read, not Lighthouse or bundle analysis)

- **13 files call `useAppConfig()` independently** (5× in TasksPage.tsx,
  4× in DashboardPage.tsx, plus BackendWorkDrawer, DocumentsWorkDrawer,
  FieldReviewDrawer, BulkTaskModal, TaskDetailDrawer, 3 combobox
  components, ReportsPage, TeamPage, TemplatePage). No shared/memoized
  singleton exists. Each opens its own independent `onSnapshot` on
  `appConfig/global` — confirmed now to be a small document (14,948
  bytes) re-fetched and re-parsed many times over, not a heavy one.
- **`TaskCard` (TasksPage.tsx) is not wrapped in `React.memo`**, and its
  `onClick` prop is a fresh inline arrow function on every parent
  render — would defeat memoization even if applied.
- **`TaskDetailDrawer.tsx` (96 KB, the largest component in the app)
  has zero `useMemo`/`useCallback`/`React.memo` anywhere** — every
  value and callback, including its sub-components (`AdminStageOverride`,
  `SaleClosedControl`, `CorrectionRescueControl`), recomputes on every
  render.
- **Confirmed real overlap on DashboardPage.tsx:** 5 independent
  `getCountFromServer` calls, 1 independent `onSnapshot`, 1 separate
  50-row activity query — all against the same `tasks` collection on
  one page load, none sharing results with each other or the global
  `useTasks.ts` listener also mounted app-wide.
- **Combined effect:** any user's stage transition writes
  `appConfig/global` → potentially 5+ TasksPage listeners fire → each
  re-renders `sorted.map()` over up to 200 unmemoized `TaskCard`s →
  if a drawer is open, its entire unmemoized tree re-renders too.
  Plausibly ~1,000 component re-renders triggered by someone else's
  action, invisible to page-load metrics (Lighthouse) or static bundle
  analysis (all 7 external audits) — only found by reading actual
  render-triggering code.
- **Confirmed via direct code read: no listener leaks anywhere.** All 6
  `onSnapshot` calls in the codebase properly return their unsubscribe
  from the enclosing `useEffect`; RTDB's `useOnlineUsers` likewise. An
  earlier hypothesis that listeners accumulate over a session was
  checked and is **wrong** — record so it isn't re-investigated.
- **Confirmed: nothing in the app is optimistic.** Every action handler
  checked (`UpdateTaskDrawer`'s submit, `TaskDetailDrawer`'s toggles)
  awaits the Firestore write before updating the screen. A field
  engineer pressing Submit sees a disabled button for the full
  round-trip (write + photo upload + pipeline transition) before the
  drawer closes. The offline path is the one exception — it writes to
  IndexedDB and closes almost immediately, meaning **offline
  submissions currently feel faster than online ones.**
- **Confirmed: Dashboard's loading states are correctly built** — real
  `animate-pulse` skeleton blocks during the measured 6-second data
  gap, not bare zeros. The perceived-slowness problem is real but not
  compounded by a missing indicator there. TasksPage's 200-card list
  loading state was not definitively confirmed either way — remains a
  small open question.

## RULED OUT — do not re-investigate these

Documented so nobody wastes time re-chasing them:

- **Firestore region is correct.** Production is `asia-south1`
  (Mumbai), geographically appropriate for India-based users. The
  leading hypothesis — that US-hosted data added 200–300 ms per query —
  is **dead.**
- **`reconcilePipelineCounts` does NOT scan the task collection.** It
  performs one cheap `getDoc` on `appConfig/global` and validates the
  counter map's shape/sign. It only escalates to the heavy
  `backfillPipelineCounts()` if counts are missing, negative, or a key
  is absent. A strong hypothesis that it scanned on every admin
  dashboard load was **wrong.**
- **`getCountFromServer` is not a latency problem.** Four calls
  measured at 46–62 ms each. (A separate *cost* concern at scale
  remains open — see `PARKED.md` — but speed is fine.)
- **The Dashboard does not load all tasks unbounded.** Bounded at
  `limit(200)`.
- **Accessibility is genuinely good** — 94–95, with only colour-contrast
  issues. 16 audits passed including ARIA, labels, tab order, and touch
  target sizing. An earlier assumption that accessibility was a likely
  weak spot was **wrong.**

## Secondary findings (real, lower leverage)

- **Back/forward cache disabled for 4 reasons:** `cache-control:
  no-store` on the main resource (flagged actionable), a JS request
  with `no-store`, and WebSocket usage (Firestore listeners). Every
  back-navigation is a full reload rather than an instant restore.
- **Firebase Auth `accounts:lookup` takes 1.53 s** and sits on the
  critical path — role-gated content can't resolve until it returns.
  Largely Firebase's own endpoint latency; limited local control.
- **Cache lifetimes:** `firebaseapp.com/auth/iframe.js` (93 KiB) has a
  30-minute TTL; est. 80 KiB of repeat-visit savings.
- **Render-blocking requests:** Google Fonts `css2` ×2 (1.7 KiB) and
  `registerSW.js` + app CSS (8.1 KiB). Both measured at 0 ms duration —
  low real impact.
- **No CSP, COOP, XFO, or Trusted Types** (Lighthouse Trust & Safety
  section, all unscored/failing). Cross-reference `PARKED.md`.
- **5 third-party cookies** from `apis.google.com` — inherent to the
  Firebase Auth iframe, not something introduced by this app.
- **Missing source maps** for large first-party JS — hinders production
  debugging.
- **`robots.txt` returns `index.html`** — the SPA rewrite catches it,
  producing 32 parse errors. Cosmetic misconfiguration.
- **No meta description** (SEO 82). Irrelevant for an internal tool.
- **Desktop Best Practices 100 vs mobile 77** — the gap is the
  third-party-cookie and source-map flags appearing only on the mobile
  run.

## STILL UNMEASURED — the next round of questions

Honest list of what this audit did *not* answer:

1. **Route-to-route navigation timing.** Lighthouse measures only
   initial load; client-side route changes were never measured.
2. **Interaction latency** — opening a task drawer, submitting a form,
   applying a filter.
3. **`/tasks` on mobile Lighthouse** — only `/dashboard` was run on both
   device profiles; `/tasks` has network data only.
4. **Photo load timing specifically** — loads after the Lighthouse
   window; needs a manual Network-panel measurement with images
   filtered.
5. **Real field-engineer experience** on their actual devices and
   networks, rather than an emulated Moto G Power.

## FIX PLAN — ranked by measured impact per unit of risk

### P0 — small, safe, independently verifiable

| # | Action | Measured benefit | Risk |
|---|---|---|---|
| 1 | **Remove Google Analytics** (`gtag.js` + inline `dataLayer` snippet from `index.html`) | −147.3 KiB (23% of all JS), −631 ms mobile CPU | None. One-line deletion. No app code touched. |
| 2 | **Remove `firebase/storage`** from `manualChunks` in `vite.config.ts` (verify no import exists first) | Shrinks the heaviest chunk; confirmed dead code | Very low |
| 3 | **Add Cloudinary delivery transformations** at the 9 render sites listed above (e.g. `w_400,q_auto,f_auto` for thumbnails; full size only on explicit zoom/open) | Largest real-world mobile/field win available | Low — display-only, no writes |
| 4 | **Wrap `TaskCard` in `React.memo` + wrap `handleCardClick` in `useCallback`** in `TasksPage.tsx` | Stops up to 200 unnecessary re-renders per `appConfig` write | Low risk, conventional React, no business logic touched |

### P1 — larger, highest structural payoff

| # | Action | Measured benefit | Notes |
|---|---|---|---|
| 5 | **Split `vendor-utils`** — keep `zustand` always-loaded; lazy-load `xlsx`, `papaparse`, `recharts` | 135.2 KiB currently wasted per page (79%) | Field engineers never chart or export |
| 6 | **Route-level code splitting** (`React.lazy` + `Suspense` per page) | App chunk is 84% unused per page | Also enables error boundaries per route |
| 7 | **CONFIRMED: `templateVersion` referencing** instead of embedding `fields` on every task | Confirmed ~halves the 3.6 MB payload (measured 55% average, see ROOT CAUSE 2b) | **Real migration across ~750 live documents. Scope carefully; do not rush.** An external audit independently proposed this. |
| 8 | **Consolidate the 13 independent `useAppConfig()` call sites** into one shared subscription/context | Removes the 6+-simultaneous-listener multiplication | Real refactor across 13 files; test thoroughly, don't rush |

### P2 — real, lower leverage

| # | Action | Notes |
|---|---|---|
| 9 | Narrow what the 200-task listener carries, or split it per-view | Admin dashboard needs counts (already from `appConfig`) + follow-ups, not 200 full documents |
| 10 | Firebase SDK 10.14.1 → 12.x | Addresses the 4.8 s mobile CPU cost. Genuine upgrade risk; test thoroughly |
| 11 | Investigate the bfcache `no-store` header (the one flagged "actionable") | Makes back-navigation instant |
| 12 | Fix colour-contrast issues | Only real accessibility gap |
| 13 | Publish source maps; fix `robots.txt` rewrite | Debuggability + tidiness |

## Honest scores (measurement-backed)

- **Performance: 45/100.** Desktop initial paint is genuinely good
  (1.2 s). But 59.5% wasted JS, a 3.6 MB payload on every load,
  full-size images on mobile, and 5.7 s / 8.1 s mobile paint are all
  real and all measured.
- **UI/UX: deliberately unscored.** Lighthouse measured accessibility
  (94–95), not usability. Ansh's judgement and field-engineer feedback
  are more reliable here than an audit tool or an AI reading
  screenshots.

## Cross-references

`SCALABILITY.md` (code-derived scaling analysis — note its performance
claims were inference, this document supersedes them with measurement) ·
`PARKED.md` (count-polling cost, CSP, unbounded arrays, SDK version) ·
`SUGGESTIONS.md` · `ARCHITECTURE.md` (bundle/chunk structure) ·
`TRACKER.md` (session log).
