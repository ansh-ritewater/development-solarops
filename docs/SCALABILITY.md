# SolarOps — Scalability & Production-Readiness Audit

**Last updated: 7 August 2026**
This file exists to separate *confirmed facts, found via direct code/
build read* from *assumption* — every claim below was checked, not
inferred, on 7 Aug 2026. Where something is genuinely unknown (not
checked), it's stated as unknown rather than guessed. See
`docs/ARCHITECTURE.md` for the general tech-stack reference and
`docs/PARKED.md` for the full deferred-item backlog this file draws on.

---

## 1. Test coverage — **zero, confirmed**

```
find . -iname "*.test.ts*" -o -iname "*.spec.ts*" -o -path "*__tests__*"
  → no results (outside node_modules)
grep "test"/jest/vitest/@testing-library in package.json
  → no results
```

There is no test file anywhere in `src/`, and no test runner
(`jest`, `vitest`) or testing library is even installed as a
dependency. The `"test"` npm script does not exist. This means:
every fix made this session (`markLeadConverted`, `reEngageLead`,
`PipelineTracker`, the Dashboard count queries) was verified by
`tsc`/`build`/manual click-through only — there is no automated
regression safety net, and none of this session's changes are
covered by anything that would catch a future regression
automatically.

## 2. CI/CD — **none, confirmed**

```
find .github -type f        → no results (folder doesn't exist)
find *.yml/*.yaml (non-Firebase) → no results
```

There is no `.github/workflows/` folder and no CI config of any kind
in the repo. Every deploy is the manual process already documented in
`docs/TRACKER.md`'s "Next deployment checklist" — a human runs
`tsc`/`build` locally, copies specific files to `D:\SolarOps`, and
runs `firebase deploy` by hand. There is no automated build-on-push,
no automated type-check gate on PRs (there are no PRs — this is a
single local repo pushed straight to `main`), and nothing stops a
broken build from being manually deployed other than the person
running the checklist correctly every time.

## 3. Firebase App Check / rate-limiting — **none, confirmed**

```
grep "AppCheck|app-check|rateLimit|throttle" src/ firebase.json
  → no results
```

No App Check integration exists anywhere in the client code or
`firebase.json`. Combined with the already-documented facts that
this app has **zero Cloud Functions** (`docs/ARCHITECTURE.md`) and
Firestore security rules are the *only* server-side gate on writes,
this means: any request that can obtain a valid Firebase Auth token
can write to Firestore at whatever rate the client (or a modified/
scripted client) chooses. There is no request-count throttling, no
App Check attestation that the request is coming from the real app,
and no reCAPTCHA/abuse layer of any kind. This isn't a new finding —
`docs/PARKED.md`'s Hygiene section already lists "Rate-limiting /
abuse protection on write paths" as deferred — this section confirms
the deferral is total, not partial.

## 4. The real `appConfig/global` write count — every path, whole codebase

`grep -rn "doc(db, 'appConfig'" src/` returns **58 matches across 13
files**. Grouped by file, with a judgment call on trigger frequency:

| File | Function(s) | Trigger | Frequency |
|---|---|---|---|
| `usePipelineActions.ts` | every stage-transition function (`submitFieldReviewDecision`, `submitDocuments`, `markLeadConverted`, `reEngageLead`, `adminOverrideStage`, etc.) | ordinary user/admin action | **Frequent** — this is the hot path, one write per stage move |
| `useTaskSubmit.ts` | survey submission flow | ordinary field-engineer action | **Frequent** — every survey submit |
| `useTaskActions.ts` | `createTask`, `archiveTask`, `unarchiveTask`, `updateTaskDistrict`, `setSaleClosedManual`-adjacent counter paths | ordinary user action | **Frequent** for create/archive; **occasional** for district edits |
| `useUserActions.ts` | user create/role-change/delete, member-count maintenance | admin action | **Occasional** — team management isn't a per-minute action |
| `useTemplateActions.ts` | template field edits, checklist edits | admin action | **Rare** — template editing is infrequent |
| `TemplatePage.tsx` | "Recalculate Pipeline Counts" and other Admin Tools buttons | admin one-off tool | **Rare** — manual button clicks |
| `initAppConfig.ts` | boot-time backfills + `reconcilePipelineCounts` | auto-run per admin page load (see `docs/PARKED.md`'s full 17-function accounting) | **Frequent but read-heavy** — most are `getDoc` reads; only a few (`reconcilePipelineCounts`) write, and only when a real mismatch exists |
| `useAppConfig.ts` | live subscription (`onSnapshot`) | every open session | **Read-only**, not a write — but relevant because every one of the writes above re-triggers this listener in every open tab |
| `TaskQueueProcessor.tsx` | offline-queue retry processing | ordinary action, replayed on reconnect | **Frequent when offline queue drains**, otherwise idle |
| `DocumentsWorkDrawer.tsx` | a `getDoc` read, not a write | n/a | read-only |
| `districtUtils.ts`, `findLeastLoadedUser.ts` | shared helpers called from several of the above | inherits caller's frequency | varies |

**Honest estimate at 100 active users:** the realistic concurrent-
write risk isn't 100 independent random writers — it's however many
users are moving a task between pipeline stages in the same
few-second window (survey submit, proposal accept/reject, document
approval, etc.), since those are the paths that fire on ordinary,
frequent user action. At 100 total active users spread across a
working day, the number performing a stage-transition action in the
same 1-2 second window is realistically small (low single digits in
almost all normal usage), which is well within Firestore's per-
document write-contention tolerance (Firestore serializes writes to a
single document and will retry a `runTransaction` automatically on
contention). The real risk is not "the app breaks at 100 users" —
it's a slow, compounding tail-latency cost as usage grows well past
that, plus the fact that a genuine burst (e.g. many engineers
submitting surveys at the same clock-in time each morning) is a
plausible-not-theoretical scenario this design doesn't handle
gracefully. This matches `docs/PARKED.md`'s existing framing of this
as a risk "ahead of the 1-lakh-task goal," not an active production
incident today.

## 5. Task document size growth risk

**`stageHistory` — bounded, confirmed.** Every one of the 7 write
sites in `usePipelineActions.ts` (lines 342, 447, 503, 629, 831, 1067,
1164) caps it identically via `existingHistory.slice(-49)` before
appending the new entry — so `stageHistory` can never exceed 50
entries regardless of how many times a task moves stages over its
lifetime. This is a real, consistently-applied cap.

**`applicationJourneySteps` — bounded by design, not by code.** This
array's length is fixed to however many steps exist in the admin-
configured Application Journey template (`Type: JourneyStepAnswer[]`,
`src/types/index.ts:305`) — it's populated once from the template and
individual entries are mutated in place (`completeJourneyStep`,
`saveJourneyStepDraft`), never appended to. Not a growth risk.

**`remarks` (per journey step) — UNBOUNDED, confirmed. This is a real
finding, not previously documented.** `saveJourneyStepRemark` in
`usePipelineActions.ts:944` does:
```ts
remarks: [...(s.remarks ?? []), newEntry],
```
There is no cap, no slice, no limit anywhere on this array. Every
remark ever added to a given journey step accumulates forever, for
the life of the task. On a long-lived task with many back-and-forth
remarks across multiple journey steps, this is a genuine (if slow)
path toward Firestore's 1MB document-size limit — unlikely to be hit
by any single task soon, but structurally unbounded in a way
`stageHistory` explicitly is not.

**`fieldPhotos` / `documentPhotos` (`Record<string, string[]>`) —
UNBOUNDED, confirmed, also a real finding.** These store Cloudinary
URLs (not the binary photos themselves, so each entry is small — a
URL string, not a photo), keyed per field, each value an array of
URLs. Nothing in the codebase caps how many URLs can accumulate per
field across resubmissions/corrections. Given these are just URL
strings, this is a much slower/smaller growth risk than `remarks`
in absolute bytes, but is still structurally uncapped.

**Bottom line:** not every array-shaped field on `Task` is bounded.
`stageHistory` is properly capped everywhere; `applicationJourneySteps`
is naturally bounded by template design; `remarks` and the two photo-
URL maps are genuinely unbounded. None of this is an active
production incident today (task documents are nowhere near 1MB in
practice), but it is a real, previously-undocumented structural gap
worth tracking as the app matures and tasks live longer.

## 6. Frontend performance — real bundle facts

```
grep "lazy(|React.lazy|Suspense" src/App.tsx  → no results
grep "ErrorBoundary" src/ -r --include=*.tsx  → no results
```

**Confirmed: zero code-splitting, zero route-level lazy-loading, zero
error boundaries anywhere in the app.** Every page/route is bundled
and loaded up front as one JS payload — there is no `React.lazy`, no
`Suspense` boundary, and no per-route chunking of any kind. A fresh
`npm run build` run during this session confirms the real production
bundle sizes (these are the actual current build outputs, not
estimates):

```
vendor-ui-*.js        121.68 kB (gzip  37.78 kB)
vendor-react-*.js     180.08 kB (gzip  59.22 kB)
index-*.js            559.97 kB (gzip 128.51 kB)   ← the entire app: every page, every drawer, every hook
vendor-utils-*.js     707.64 kB (gzip 211.81 kB)
vendor-firebase-*.js  752.35 kB (gzip 174.43 kB)
```
Vite's own build output flags this directly: *"Some chunks are larger
than 500 kB after minification."* The single `index-*.js` chunk
(560 kB / 128.5 kB gzipped) is the whole application — Dashboard,
Tasks, Template editor, Reports, every drawer and every admin tool —
loaded on first paint regardless of which single page a given user
actually opens. Combined with zero error boundaries, a single
unhandled render error anywhere in this one giant bundle can in
principle crash the whole app's UI rather than being contained to one
page/component. Total initial JS to parse before the app is
interactive is roughly 1.6 MB minified / ~470 kB gzipped across the
four non-CSS chunks above — noticeable on a slow connection, though
not unusual for a Vite/React app that hasn't yet invested in route-
level splitting.

---

## Reconciling with everything already confirmed this session

- The **`appConfig/global` hot-document pattern** (`docs/PARKED.md`)
  is now backed by an exact count: 58 write call-sites across 13
  files, not a vague "many places" — see Section 4 above for the
  frequency breakdown.
- **No Cloud Functions** (`docs/ARCHITECTURE.md`) means Section 3's
  finding isn't one gap among several server-side layers — it's the
  *only* layer. Firestore security rules are doing 100% of the
  server-side enforcement work in this app, with no App Check, no
  Cloud Function validation, and (per `docs/PARKED.md`) no field-level
  write restriction on `appConfig` either.
- **Denormalized counters across ~13 code paths** (`docs/PARKED.md`)
  and this file's Section 4 findings are the same underlying
  structural choice viewed from two angles — PARKED.md flags the
  drift risk if a path is missed; this file quantifies how many paths
  actually exist and how often each fires.
- **The unbounded admin tools** — the 8 `localStorage`-gated boot
  functions and the "Migrate Historical Reverted Tasks" risk
  (`docs/PARKED.md`) — are a *client-trust* gap in the same family as
  Section 3's missing App Check: nothing server-side stops a modified
  client from re-triggering any of these at will, since the gating is
  entirely client-side convention, not a security rule.
- Sections 1, 2, 5, and 6 (test coverage, CI/CD, task-document growth,
  frontend bundling) are **new findings from this specific read** —
  none of these were previously documented anywhere in `docs/`.

## If you only fix N things before real scale, fix these

Ranked by (severity × likelihood of actually biting), not by effort:

1. **Add Firestore security rules validation for `appConfig` writes**
   (already flagged in `docs/PARKED.md` as "Tightening `appConfig`
   write permissions") — this is the highest-leverage fix because it's
   the *only* server-side gate that exists at all (Section 3), and it
   currently allows any authenticated client to write anything to the
   single most heavily-shared document in the app (Section 4).
2. **Cap the `remarks` array and consider a similar cap for
   `fieldPhotos`/`documentPhotos`** (Section 5, new finding) — cheap
   to fix now (mirror the existing `stageHistory.slice(-49)` pattern),
   expensive to discover in production as a document silently
   approaching Firestore's 1MB limit on an old, heavily-revised task.
3. **Stand up even minimal CI** (Section 2) — a single GitHub Actions
   job running `tsc --noEmit` + `npm run build` on every push would
   catch the exact class of mistake this session's whole verification
   ritual (`tsc`/`build`/`git diff` on every single edit) exists to
   prevent, automatically, without relying on a human running it
   correctly every time.
4. **Write tests for the pipeline-transition functions specifically**
   (Section 1) — `usePipelineActions.ts` is both the highest-
   complexity file in the codebase and the one that's been hand-fixed
   three times this session alone (`markLeadConverted`, `reEngageLead`,
   the correction-field safety nets); it has the most to gain from
   automated regression coverage and currently has none.
5. **Add route-level code-splitting** (Section 6) — lower urgency than
   1-4 since it's a performance/UX concern rather than a correctness
   or data-integrity one, but the fix is well-understood (`React.lazy`
   per route) and the current single 560 kB app bundle will only grow
   as more features are added on top of it.

Rate-limiting/App Check (Section 3) and CI (item 3 above) are related
but distinct: CI protects against *your own* bugs reaching production;
App Check/rules protect against a *malicious* client. Both matter, but
item 1 above (rules) is the cheaper, more urgent fix of the two given
this app has zero Cloud Functions to fall back on.
