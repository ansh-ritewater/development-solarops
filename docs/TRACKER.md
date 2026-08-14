# SolarOps — Deployment & Work Tracker

**Last updated: 13 August 2026**

## Current deployment status

**Last verified against a full fresh reconciliation: 12 August 2026.
Deployed to production: 12 August 2026.**

**Production (`solarops-ritesolar`) currently has, confirmed live:**
- Everything through `5b57729`, PLUS the full 12-file batch deployed
  12 Aug 2026: `43207a6` (status-corruption fix + repair tool +
  `needsResurvey`), `0916375` (PipelineTracker fix, Override warning,
  correction-rescue button, Dashboard count-query fixes), `b8931a6`
  (`markLeadConverted` safety net), `a7489e5` (`reEngageLead` true-
  origin routing), `f6437d6` (State+Date/Due-Date filter), `bf2b513`
  (Sales Closed recency), `05b17f5` (Showing-count + Sales Closed
  export), and standalone `2d4f29e` (Application Journey photos).
- All 3 new Firestore indexes (`archived+saleClosed+updatedAt`,
  `archived+state+createdAt`, `archived+state+dueDate`) — deployed,
  confirmed `Enabled`.
- **Production's real corrupted-task count: 19**, found via "Check
  Status/Stage Corruption" on the live site, 12 Aug 2026 — repaired,
  re-checked, confirmed 0 remaining. (Dev's earlier equivalent count
  was 13 — the two numbers are expected to differ since dev and prod
  hold different real data; not a discrepancy to chase.)
- **Smoke-tested live in production, confirmed working:** Sales
  Closed recency ordering; State+Created-Date filter accuracy;
  Application Journey photos rendering in the admin drawer; Sales
  Closed Excel export. **Deliberately NOT independently smoke-tested
  live** (Ansh's decision, 12 Aug 2026): the `adminOverrideStage`
  corruption-fix code path itself, via a live forward/backward move
  on a real production task — judged unnecessary given `usePipeline
  Actions.ts` is confirmed byte-for-byte identical to dev's copy
  (verified via `diff -rq`, zero output) and was already live-tested
  across multiple scenarios there. This is a documented decision to
  rely on file-identity + prior dev testing, not an independent live
  production confirmation of that one specific code path — worth
  knowing if this exact bug family is ever revisited.
- "Migrate Historical Reverted Tasks" was NOT clicked at any point —
  confirmed by Ansh. Remains parked and dangerous regardless of this
  deployment; unrelated to it.

**Production does NOT yet have:**
- The removal of the two temporary diagnostic buttons ("🔍 Check
  Status/Stage Corruption", "🔧 Repair Status/Stage Corruption")
  from Template → Admin Tools — this edit is done and build-verified
  in DEV ONLY (`src/pages/TemplatePage.tsx`), not yet copied to or
  deployed on production. **Both buttons are still live on the
  production site right now.** Deliberately held for a separate,
  later deploy — Ansh's decision, 12 Aug 2026.

## Work log (chronological)

**Session — late July/early August 2026:**
- Built and deployed: error logging system, Sales Closed feature,
  Firestore + Cloudinary backups, dev Firestore index cleanup
  (90 → 45 deployed indexes, matching declared JSON)
- Found and fixed: Dashboard/Tasks-page badge mismatches for pipeline
  stages and status tabs (corrected tasks were hidden from lists while
  still counted in badges); Dashboard "Total" card was a flawed 4-bucket
  sum instead of a real count; Blocked/Pending/In Progress counts
  included tasks that had moved to Dropped/Converted while keeping a
  stale status label
- Made Dashboard cards clickable (deep-link to matching Tasks tab)
- Committed as `5b57729`, later deployed to production

**Session — 4-6 August 2026:**
- Found and fixed a real data-corruption bug: `adminOverrideStage` was
  silently resetting a task's `status` field to `'pending'` on almost
  any admin override move (Quick Correction or Full Restart), unless
  the destination was specifically the Converted stage — corrupting
  real historical data on every affected move
- Built `reconcileStatusStageCorruption` repair tool + two admin
  diagnostic buttons; ran in dev — found and repaired 13 corrupted tasks
- Found and fixed a related visibility gap: Full-Restart-to-Survey
  tasks were invisible to field engineers (built `needsResurvey`);
  fixing this initially caused a regression for live Quick-Correction-
  to-Survey tasks, which was found and fixed in the same pass
- Confirmed via full code audit: every other destination (Proposal,
  Field Review, Documents, Backend) was never affected by any of this
- Committed as `43207a6`, pushed to dev's GitHub — NOT yet deployed
- Corrected two earlier mistaken assumptions this same session (see
  `KNOWN_ISSUES.md` for the pattern): wrongly believed `5b57729` wasn't
  deployed (it was — confirmed via file hash); wrongly worried the
  required Firestore index might be missing from production (it wasn't
  — confirmed via gcloud)

**Session — 6 August 2026 (documentation audit):**
- Built the full docs/ set (README, TRACKER, FEATURES, PARKED,
  KNOWN_ISSUES, SCHEMA, PIPELINE_FLOW, ARCHITECTURE) from genuine fresh
  reads of the entire codebase, not memory — 5 read batches covering
  every page, drawer, hook, and util
- Real findings along the way: the `initAppConfig.ts` boot-time
  backfill sequence (11 functions auto-run on admin Dashboard load, 8
  gated only by client-side `localStorage`, not server-side); the
  invite-link signup system (`invites`/`SignupPage.tsx`/
  `useInviteActions.ts`) confirmed genuinely orphaned — zero caller
  anywhere, the real flow is TeamPage's "Create User"; a real UI-text
  bug in the offline queue's oversized-file toast (said 15MB, actual
  caps are 10MB images / 20MB PDFs) — fixed directly, see below
- **⚠️ Found, NOT fixed — "Migrate Historical Reverted Tasks" (Template
  → Admin Tools) can undo the status-corruption fix from the previous
  session, going forward, for any future Full-Restart-with-a-custom-note
  move. Ansh's decision: do not click this button; fix deferred, not
  urgent since nobody is using it. Full detail in PARKED.md.**
- Small fix made and applied directly: corrected the oversized-file
  toast text in `TaskQueueProcessor.tsx` (15MB → 10MB/20MB, matching
  the actual enforced caps)
- Nothing from this session deployed anywhere; nothing committed yet

**Session — 6 August 2026 (parked-item fix):**
- Fixed `markLeadConverted` to clear the same 5 correction-tracking
  fields already cleared identically in `submitFieldReviewDecision`
  and `submitDocuments` — a lead converted to Completed while still
  carrying a live correction pointer no longer stays permanently stuck
  in "Needs Correction"
- Tested live: Quick-Corrected a Backend task to Documents, back to
  Backend, completed the Application Journey, marked Converted —
  confirmed `correctionReturnTo` correctly resolved to `null`
- One process note from this test: the fix initially appeared not to
  work after editing, traced to a stale dev-server bundle, not a code
  problem — resolved by a full restart + hard browser refresh (see
  KNOWN_ISSUES.md)
- Committed as `b8931a6`, pushed — sitting in dev, will ride along in
  the next deployment's existing file-copy list (usePipelineActions.ts
  already included)

**Session — 7 August 2026 (parked-item fix):**
- Fixed `reEngageLead` to route by the lead's true drop origin (read
  from `stageHistory`) instead of always sending it to Proposal:
  Field Review-drops still → Proposal (unchanged behavior); Survey-drops
  → Survey with status reset to `pending`; Documents-drops → Documents;
  Backend/Converted-drops → Documents with Application Journey data
  cleared (treated as a fresh process after abandonment); unrecognized
  origins safely fall back to the old Proposal behavior with a logged
  warning
- Also defensively clears the 5 correction-tracking fields, matching
  the safety net already added to `markLeadConverted`
- Counters and auto-assignment now driven by the real destination
  stage, using the same generic `pipelineCounts.${stage}` pattern
  already proven in `adminOverrideStage`, rather than hardcoded values
- Tested live across all 7 scenarios: unchanged Field Review path, all
  4 new drop-origin routings, the correction-field safety net, and
  counter/auto-assign correctness for each destination
- Committed as `a7489e5` — held from push, not yet in the next
  deployment's file-copy list (usePipelineActions.ts already covered
  there from the earlier corruption fix)

**Session — 7 August 2026, part 1 (parked-item fixes):**
- Confirmed `completeJourneyStep`/`saveJourneyStepDraft` never touch
  `pipelineStage`, `status`, or correction fields — not the same bug
  family as `markLeadConverted`/`reEngageLead`, no fix needed
- Live-tested Full Restart's status-preservation behavior directly
  (forward and backward moves, plus direct-to-Converted) — confirmed
  identical to Quick Correction's already-proven behavior
- Fixed `PipelineTracker.tsx`'s dropped-task display: now derives the
  true drop origin from the last `stageHistory` entry instead of
  hardcoding Field Review, so a task dropped straight from Survey no
  longer visually shows Proposal/Field Review as falsely "done" —
  cosmetic fix only, real stageHistory data was always correct
- Tested live: Survey-dropped, Field-Review-dropped, and
  Documents/Backend-dropped tasks all now show the correct pills
- Committed as part of `0916375` (8 Aug), pushed to origin/main —
  confirmed NOT uncommitted, corrected 12 Aug 2026 after a direct
  git-log/git-diff check found this note was stale

**Session — 7 August 2026, part 2 (parked-item fixes):**
- Built a soft warning in Admin Override: selecting a stage for Quick
  Correction that isn't genuinely earlier than the task's current
  stage now shows a red inline warning plus a stronger confirm-dialog
  message, nudging toward Full Restart instead — does not block the
  action, purely advisory
- Extracted stage-ordering logic (`STAGE_ORDER`/`stageIndex`) out of
  `PipelineTracker.tsx` into a new shared `src/utils/stageOrder.ts`,
  avoiding duplicate-logic drift; `PipelineTracker.tsx` now imports
  from it instead of maintaining its own private copy
- Added `clearStuckCorrectionFlag` + a new admin-only "🔧 Clear stuck
  correction flag" rescue button, shown only when a task has a live
  correction pointer — lets an admin manually clear it without editing
  Firestore directly
- Tested live: forward-move warning appears correctly; genuine
  backward move shows no warning, unchanged original message; rescue
  button clears the pointer and disappears afterward, confirmed in
  Firestore
- Committed as part of `0916375` (8 Aug), pushed — corrected 12 Aug
  2026, same stale-note issue as above

**Session — 7 August 2026, part 3 (parked-item fix):**
- Converted Dashboard's remaining 4 stat cards (Pending/In Progress/
  Completed/Blocked) from `getDocs(...limit(1000))` to
  `getCountFromServer`, matching the pattern already proven for the
  Total card — removes the silent 1,000-row ceiling with zero data
  visibility, no where() clause changed
- Confirmed live: all four numbers render correctly, browser console
  shows no index/precondition error, query shape unchanged from the
  already-indexed getDocs version so no new index was needed
- Committed as part of `0916375` (8 Aug), pushed — corrected 12 Aug
  2026, same stale-note issue as above

**Session — 10 August 2026 (measured performance audit):**
- Ran the first real performance measurement in the project's history:
  Lighthouse (mobile + desktop) and Network-panel analysis against
  live production, plus 4 targeted read-only code checks
- Full findings in `docs/PERFORMANCE.md`. Nothing implemented.
- **Two leading hypotheses were disproven by measurement:** Firestore
  region (correctly `asia-south1`) and `reconcilePipelineCounts`
  scanning on every dashboard load (it does not scan). A third —
  missing Cloudinary transformations — was confirmed.
- Key measured findings: a 6-second gap between first paint (1.2 s
  desktop) and data arrival (7.40 s); one 3.6 MB Firestore listener
  stream per page load; 59.5% of all shipped JavaScript unused
  (376.5 of 632.9 KiB); Firebase SDK alone costing 4.8 s of mobile CPU;
  Google Analytics accounting for 23% of all JS on an internal tool
- Also corrected an earlier wrong assumption: accessibility is
  genuinely good (94–95), not a weak spot
- Preceded by a seven-source multi-AI code audit (see the 10 Aug
  entry in `PARKED.md`) — that audit's static analysis was necessary
  but insufficient; the actual performance answers required runtime
  measurement

**Session — 12 August 2026 (two user-reported bugs, investigated):**
- Investigated two bugs via an 8-part read-only Claude Code audit,
  independently cross-checked against a direct source read: (1) the
  Tasks-page State and Lead Source dropdown filters only ever filter
  the current in-memory page of loaded tasks — neither is passed
  into `buildAdminQuery`/`subscribeToFilter`, neither appears in the
  query-rebuild `useEffect`'s dependency array, and no Firestore
  index exists for either field. Engineer, District, Date, and Due
  Date filters are all confirmed genuinely server-side by contrast.
  Full detail moved to `PARKED.md`. (2) `TaskDetailDrawer.tsx`'s
  Application Journey step renderer has no `step.type === 'photo'`
  branch at all — an admin never sees journey-step photos, for any
  photo-type step, not just one specific step. Confirmed via
  `grep "photoUrls"` returning zero matches in that file.
- Fixed (2): added the missing photo-rendering block to
  `TaskDetailDrawer.tsx`, placed as a sibling to the existing
  `step.status === 'done' && step.realDate` block, matching
  `BackendPage.tsx`'s exact structure (which also maps over all
  steps, not just completed ones — a closer match than
  `BackendWorkDrawer.tsx`, which only ever loops over already-done
  steps). `npm run build` clean, exit 0. **Confirmed 12 Aug 2026: live-tested
  by Ansh on a real task with a completed photo-type Application
  Journey step — photos now render correctly in the admin Task Detail
  Drawer. Fully resolved, not just build-clean.** (committed as
  `2d4f29e`, outside this session's own commit flow)
- (1) — Ansh's scoping decision, 12 Aug 2026: fix ONLY the
  State-filter combination with Created-Date/Due-Date, keeping them
  freely combinable (not mutually exclusive like Engineer/District);
  leave State-vs-every-other-tab, and Lead Source entirely, deferred.
  Rationale: an earlier, broader "Date Filter combined with other
  tabs" feature was already built once and fully reverted on 28 July
  2026 due to badge-count/Load-More problems — the narrow scope
  avoids that exact danger zone (see `PARKED.md` for the full
  precedent write-up).
- Implemented: `stateFilter` threaded as a 7th parameter through
  `buildAdminQuery`/`subscribeToFilter` (both the live query and
  both `loadMore` branches) in `useTasks.ts`, and through
  `fetchAllTasksForExport`'s Date/Due-Date branches in
  `TasksPage.tsx`; added to the re-subscribe `useEffect`'s
  dependency array. Two new composite indexes added to
  `firestore.indexes.json` (`archived+state+createdAt`,
  `archived+state+dueDate`) and deployed to the `development-solarops`
  Firebase project via `firebase deploy --only firestore:indexes`.
  Verified via full `git diff` line-by-line against the exact spec
  before deployment — not just a clean build.
- **Confirmed 12 Aug 2026: live-tested by Ansh** — State+Created-Date
  and State+Due-Date both return correct results; "Load More" with
  either combination active was specifically tested (the exact
  failure pattern that caused the 28 July revert) and confirmed
  correct; Engineer and District filters confirmed unaffected.
  **Fully resolved for this narrow scope.**
- Remaining scope (State vs. every other tab, Lead Source, and a
  newly-found related display bug) stays deferred — see `PARKED.md`'s
  "State filter — full scope for later" section, updated same day.
- Final state of this session: the two indexes above were deployed —
  to `development-solarops` (dev) ONLY, nothing to production. No
  commit has been made for anything from this session yet — the BUG 2
  photo-rendering fix, the State+Date/Due-Date fix, and every doc
  correction across this session are all still sitting locally,
  pending Ansh's own commit.

**Session — 12 August 2026 (Sales Closed recency fix):**
- Fixed the Sales Closed tab (admin/view_only only) to order by
  `updatedAt` DESC instead of `createdAt` DESC, and removed it from
  the stage-priority client-side re-sort (added to
  `singleStageFilters` in `TasksPage.tsx`) — so the tab now shows
  whichever sales-closed task was most recently touched (marked
  Closed, OR any later admin edit at all) at the top, regardless of
  what pipeline stage it currently sits in. Previously, stage
  (Backend > Field Review > ... > Completed) took priority over
  recency, meaning an old untouched Backend task could outrank a
  Completed task edited minutes ago.
- Verified beforehand: every `saleClosed` write site (auto-detection
  on survey submit, auto-detection on Documents submit, manual
  toggle, reset-to-auto) and every admin-edit action in
  `useTaskActions.ts` stamps `updatedAt` in the same write, with zero
  exceptions found — confirmed via direct code read before building
  on this assumption.
- Added 1 new composite index: `archived+saleClosed+updatedAt`.
  Deployed to `development-solarops` and confirmed `Enabled` —
  consistent with the live test below succeeding with no "requires
  an index" error, the same failure mode seen earlier this session
  when an index was still building.
- `npm run build` clean, exit 0; full `git diff` verified line-by-line
  against the exact spec before accepting the change, matching the
  same rigor as every fix this session — a mistaken swap of only one
  of the two `orderBy` call sites would have compiled cleanly and
  gone undetected without this check.
- **Confirmed 12 Aug 2026: live-tested by Ansh** — an FE completing
  the three payment fields correctly floats the task to the top
  immediately. Both scenarios verified: a newly-closed task, and an
  already-closed task in an earlier pipeline stage getting edited
  later and correctly overtaking a higher-stage sales-closed task
  that hadn't been touched as recently.
- Related finding from this same investigation, NOT fixed, see
  `PARKED.md`: the Excel export has no dedicated Sales Closed query
  branch (falls through to a full-collection drain); the existing
  `archived+saleClosed+createdAt` index may become newly orphaned
  once this ships, worth re-checking later.

**Session — 12 August 2026 (small display/export fixes):**
- Fixed "Showing N tasks" text (`TasksPage.tsx`) to read
  `sorted.length` instead of `tasks.length` — the number now reflects
  what's actually visible after client-side filters (State/Lead
  Source), not the raw server-fetched batch size. Real gap found
  live during the Sales Closed testing session: State=Gujarat with
  1 matching card on screen previously showed "Showing 50 tasks."
- Added a dedicated `sales_closed` branch to `fetchAllTasksForExport`'s
  `baseQMap`, ordered by `updatedAt` DESC to match the tab's own
  fixed ordering — previously this export silently fell through to
  a full-collection drain-and-filter. No new index needed; reuses
  the `archived+saleClosed+updatedAt` index added for the Sales
  Closed recency fix.
- Investigated (not deleted): confirmed via full codebase grep that
  the old `archived+saleClosed+createdAt` index is now genuinely
  orphaned — every remaining `saleClosed` query either has no
  `orderBy` (both stat-count badges) or already uses `updatedAt`.
  Ansh's decision: leave it in place for now, prioritizing feature
  work over index cleanup; safe to remove later alongside the 10
  already-documented prod orphans. See `PARKED.md`.
- `npm run build` clean, exit 0; full `git diff` verified line-by-line
  against the exact spec for both edits before accepting.
- **Confirmed 12 Aug 2026: both fully live-tested by Ansh.**
  Showing-count fix verified across multiple Load More clicks (1
  task → 5 tasks, number matched the visible card count exactly
  both times) — this same test also re-confirmed the already-known,
  already-deferred State-alone limitation is still exactly as
  documented in `PARKED.md` (only became fully visible now because
  the count is honest instead of masking it with a raw batch size).
  Excel export fix confirmed: row count and order both match the
  live tab's corrected behavior.

**Session — 12 August 2026 (production deployment):**
- Deployed the full 12-file batch + 3 Firestore indexes +
  `firestore.indexes.json` to `solarops-ritesolar`, following the
  corrected checklist above. All 4 verification checks passed before
  deploying: `diff -rq` on `src/` and on `firestore.indexes.json`
  both zero-output; `.env.local`/`.firebaserc` confirmed untouched
  via `git status`; `npm run build` clean, exit 0 in prod's own
  folder; `firebase use` confirmed `solarops-ritesolar`.
- Indexes deployed and confirmed `Enabled` before hosting deploy,
  per the correct ordering.
- Production's real corrupted-task count: 19, found, repaired,
  re-confirmed 0. See "Current deployment status" above for full
  detail and the one deliberately-deferred smoke test.
- Immediately after (same session): removed both temporary
  diagnostic buttons from `src/pages/TemplatePage.tsx` in DEV —
  both handler functions, both `useState` declarations, both
  `Button` JSX blocks, and the now-unused `reconcileStatusStage
  Corruption` import (the function itself remains in
  `initAppConfig.ts`, only its UI trigger removed). `npm run build`
  clean, exit 0; `git diff --stat` confirmed only `TemplatePage.tsx`
  changed. **NOT yet copied to or deployed on production** — see
  "Current deployment status" above.

**Session — 12 August 2026 (Admin Tools button audit + 2 more
removed):**
- Full investigation of all 5 remaining Admin Tools buttons (the
  2 diagnostic corruption buttons were already removed in an
  earlier session) — read every handler function in full, matched
  each to its `initAppConfig.ts` backend function (or confirmed
  none exists), checked for other callers/auto-run paths, and pulled
  git history for each. Full findings in `PARKED.md`.
- **Kept, confirmed genuinely still needed:** Recalculate Pipeline
  Counts (real ongoing purpose — catches pure numeric drift that
  the automatic `reconcilePipelineCounts()` fallback only catches
  for structural corruption, i.e. missing/negative/incomplete keys,
  never for plain wrong-but-complete values); Backfill Sales Closed
  (needed every time the Sales Closed field-mapping config changes);
  Recalculate Engineer & District Counts (the ONLY safety net that
  exists for drift in these hand-maintained counters — no automatic
  equivalent anywhere).
- **New finding, not previously documented:** `handleRecalculate
  PipelineCounts` does NOT call `backfillPipelineCounts()` — it
  contains its own separate inline computation. Confirmed via direct
  code comparison. Real, live drift risk (two independently-
  maintained implementations of the same logic), not hypothetical.
  Not fixed this session — kept as-is, logged for a future
  consolidation.
- **Removed: 🗺️ Migrate Existing Districts to Maharashtra.**
  Confirmed via the button's own code/confirm-dialog text to be a
  one-time single-state→multi-state schema migration — all tasks
  and users created going forward already get `state` set at
  creation. No legitimate future need identified. Separate finding
  while reading it closely: its own confirm dialog claimed re-
  running it was "safe, no duplicates due to case-insensitive
  matching" — the actual code used a plain JS `Set`, which does
  exact-string matching, not case-insensitive. The button's safety
  claim to the admin was inaccurate; moot now that it's removed.
- **Removed: ↩ Migrate Historical Reverted Tasks.** Already known-
  dangerous from an earlier session (see `PARKED.md`'s existing
  entry) — this removal confirms the reasoning more precisely after
  reading the full function: it correctly excludes already-tracked
  tasks, tasks that have moved on, and Full Restarts that kept their
  exact default note — but a deliberate Full Restart done with a
  CUSTOM note remains indistinguishable from an accidental revert,
  and would get wrongly tagged with correction tracking AND have
  `status` forced back to `'pending'` even though `'completed'` is
  the correct state for that scenario post-corruption-fix. Its
  legitimate matching set (tasks corrupted before correction-
  tracking existed) was always historical and fixed in size; now
  that the root corruption bug is fixed, no new tasks should ever
  match it going forward — usefulness near zero, risk fully intact.
- Also fixed: a dangling empty-state UI message in the States &
  Districts section that referenced the now-removed Maharashtra
  button by name — reworded to point at the actual "Add State"
  field instead.
- `npm run build` clean, exit 0 at every step; every diff verified
  line-by-line against the exact spec before accepting, matching
  this session's standard rigor throughout.
- **NOT deployed to production yet — Ansh's decision, 12 Aug 2026:
  holding this change in dev, to be bundled with other pending fixes
  into one future deployment rather than shipped alone.** Production
  still shows all 7 original Admin Tools buttons as of this writing
  (the 2 diagnostic buttons' removal is also still pending its own
  production deploy from an earlier session).

**Session — 13 August 2026 (3 small fixes — code-verified, not
independently live-tested):**
- **Offline photo base64 fallback removed** (`TaskQueueProcessor.tsx`,
  2 sites — field photos and completion photos): both now `throw`
  the real upload error instead of silently saving raw base64 into
  Firestore, letting the existing 5-attempt retry mechanism handle
  the failure the way it already does for every other error in this
  file. The completion-photos site also gained the `console.error`/
  `logError` calls it was previously missing entirely.
- **3 functions in `useTaskActions.ts` now check `role === 'admin'`,
  not just login:** `setSaleClosedManual`, `resetSaleClosedToAuto`,
  `clearStuckCorrectionFlag` (the last of which had NO auth check at
  all before this). All three now throw an explicit
  `'Not authorized — admin only'` error, matching this file's own
  existing throw-based convention for the not-logged-in case.
- **`firestore.rules`: `invites` collection's read rule tightened**
  to require authentication unconditionally — removed the clause
  allowing an unauthenticated read for any `status: 'pending'`
  invite. Confirmed beforehand via a full, separate investigation
  that this collection is genuinely disconnected from the real
  "Create User" onboarding flow (which uses Firebase Auth's own
  `sendPasswordResetEmail` directly, never touches `invites`) — so
  this change cannot affect real user onboarding.
- All 3 diffs verified line-by-line against the exact intended spec
  before accepting; `npm run build` clean, exit 0, at every step;
  `git diff --stat` confirmed only the 3 intended files changed.
- **Confirmation level, stated precisely rather than overclaimed:**
  code-verified (exact diff match + clean build + straightforward,
  well-understood logic), but NOT independently live-tested — Ansh's
  call, 13 Aug 2026, given no practical way to safely simulate a
  Cloudinary failure or a non-admin bypass attempt without
  deliberately manufacturing conditions for a test. This is a
  different confidence level than this session's other entries,
  which were all confirmed via an actual live click — noted here
  explicitly so this record stays honest about what was and wasn't
  verified.
- **NOT deployed to production** — queued with everything else
  currently sitting in dev-only, for the next batched deployment.

## Completed deployment — 12 August 2026

The 12-file + 3-index deployment described above is done. This
section is kept for historical reference only — do not re-run it.

## Next deployment checklist (when ready) — button removal only

Small, single-file, no index changes, no rules changes:

1. Copy `src/pages/TemplatePage.tsx` from dev to `D:\SolarOps`.
2. Verify clean with `npm run build` in the prod folder.
3. Deploy hosting: `firebase deploy --only hosting`.
4. Confirm live: open Template → Admin Tools on production, confirm
   both diagnostic buttons are gone.

**Session — 13 August 2026 (small cleanup + 3 decisions parked):**
- Removed the unused `firebase/storage` entry from `vendor-firebase`
  in `vite.config.ts`'s `manualChunks` — confirmed via grep that
  `firebase/storage`/`getStorage` has zero real usage anywhere in
  `src/`. `npm run build` clean, exit 0.
- **Measured, not assumed: this produced NO bundle-size change.**
  `vendor-firebase` chunk stayed at exactly 752.35 kB before and
  after. Corrected `PERFORMANCE.md`'s original claim that this fix
  "shrinks the heaviest chunk" — it doesn't, because the module was
  never actually pulled into the bundle in the first place (an
  unimported entry in `manualChunks` is a no-op for Rollup). The
  fix is still correct and worth keeping — it removes a stale,
  misleading config line — just not a performance win.
- **Three items explicitly decided NOT to do, all recorded in
  `PARKED.md`:** Google Analytics stays (only current way to see
  real usage/activity data, outweighs the measured 147.3 KB/631ms
  cost); capping `remarks` — not worth the added complexity right
  now; capping `fieldPhotos`/`documentPhotos` — explicitly rejected,
  since any cap risks dropping a reference to a genuinely important
  photo, which is unacceptable regardless of document-size risk.
- Not committed yet — vite.config.ts sitting alongside PARKED.md's
  edit, both pending the next commit.

**Session — 13 August 2026 (Lead Source fix + disabled-user rule fix):**
- **Lead Source filter**: fixed identically to State's earlier narrow
  fix — combinable with Created-Date/Due-Date only. `leadSourceFilter`
  threaded as an 8th parameter through `buildAdminQuery`/
  `subscribeToFilter` (live query + both loadMore branches) in
  `useTasks.ts`, and into `fetchAllTasksForExport`'s Date/Due-Date
  branches in `TasksPage.tsx`; added to the re-subscribe dependency
  array. 2 new indexes added to `firestore.indexes.json`
  (`archived+leadSource+createdAt`, `archived+leadSource+dueDate`),
  deployed to `development-solarops` and confirmed `Enabled`.
  **Confirmed 13 Aug 2026: live-tested by Ansh** — Lead Source +
  Created-Date and Lead Source + Due-Date both verified accurate;
  "Load More" with either combination active specifically checked
  and confirmed correctly narrowed (not a wider unfiltered batch) —
  the same failure pattern this project has been bitten by before;
  Engineer and District filters confirmed unaffected. Lead Source
  alone (no date filter) confirmed unchanged from its prior known
  limitation — not a regression, that scope remains deferred exactly
  as documented. **Fully resolved for this narrow scope**, matching
  State's fix exactly.
- **Disabled-user Firestore rule gap fixed.** See `PARKED.md` for
  full detail on the fix and its live test — genuinely confirmed
  working via a real two-tab test (an already-open session for a
  disabled account was blocked mid-session by the database itself,
  not just the app's own sign-out check). Deployed to
  `development-solarops` only.
- `users` collection PII exposure (item 5 from this session's
  4-item review) — investigated in full, Ansh's decision to park
  as-is rather than attempt a quick fix. Full reasoning in
  `PARKED.md`.
- "Showing N tasks"/Load More's remaining filter-awareness gap —
  confirmed still exactly as documented, no independent fix
  available separate from the full State/Lead-Source scope work
  already deferred.

**Session — 13 August 2026 (3 quick fixes from the 6-item follow-up
review):**
- **`view_only` blocked from `/error-logs` specifically** — added a
  new, stricter `adminOnly` route flag (distinct from the existing
  `requireAdmin`, which correctly still includes `view_only` for
  Team/Template/Reports). Only the `/error-logs` route changed.
  Confirmed beforehand: `view_only` already had zero write access
  anywhere across Team/Template/Reports/Error-Logs — this was purely
  a route-vs-rules mismatch (route let them in, the rules blocked
  real data), not a data-security gap. **Live-tested by Ansh:**
  `view_only` now redirects cleanly instead of hitting a broken
  page; Team/Template/Reports confirmed unaffected; admin access to
  Error Logs confirmed unaffected.
- **Survey-stage direct-override `status` gap fixed** — added one
  new condition to `adminOverrideStage`: force-moving a task
  directly out of Survey (skipping the normal submit flow, while
  still `pending`/`in_progress`/`blocked`) now sets `status` to
  `completed` as part of that same override, instead of leaving it
  frozen forever with nothing to ever revisit it. **Live-tested by
  Ansh:** confirmed on a real Survey-stage task force-moved to a
  later stage — `status` correctly updated; confirmed a normal
  override (task already past Survey) is unaffected.
- **Offline queue identity binding fixed** — `QueuedTaskUpdate` now
  carries `createdByUid`, stamped at both real call sites
  (`useTaskSubmit.ts`, `UpdateTaskDrawer.tsx`); `TaskQueueProcessor.tsx`
  skips syncing any item stamped for a different uid than whoever's
  currently logged in; `Header.tsx`'s logout now clears queued items
  belonging to the logging-out user specifically (plus any legacy
  pre-fix items with no stamp at all) — refined from an initial
  clear-everything version to this scoped version, since it's
  strictly more careful at zero extra cost, even though Ansh
  confirmed devices aren't shared in practice so the two versions
  are behaviorally identical for real usage. **Live-tested by
  Ansh:** the actual cross-session scenario (person A queues offline,
  logs out, person B logs in same device) confirmed working before
  the scoped refinement; the refinement itself verified by direct
  code review rather than a repeat test, since it introduces no new
  mechanism — only a plain, simple filter condition over the same
  already-proven clear/skip logic.
- `initMemberInCounts` "double-counting" concern — investigated,
  NOT a real bug: only one call site exists in the whole codebase,
  and the function is already idempotent per-uid by design. Cleared,
  not fixed.
- Stored XSS risk — confirmed REAL via this session's audit (every
  photo/document render site checked renders raw stored URLs with
  zero scheme check), but deliberately NOT fixed this session — sized
  as its own separate piece of work (a shared safety-check helper
  across ~9 render sites), not a quick fix. Remains open, see
  `PARKED.md`.
- `npm run build` clean at every step; every diff verified
  line-by-line against spec before accepting, matching this
  session's standard rigor throughout.
- **NOT deployed to production** — queued with everything else
  currently sitting in dev-only.

**Session — 14 August 2026 (3 structural-risk fixes):**
- **Tab-counts polling interval lengthened 60s → 180s** — one-line
  change, `useTasks.ts`'s `useTabCounts`. Deliberately conservative:
  cuts the ~$150-300/month estimated polling cost by roughly 3x
  with no code restructuring; only affects how quickly a CHANGE
  MADE BY SOMEONE ELSE shows up in your own badge numbers while
  idle — your own actions still update instantly, and the real task
  list itself is a separate live connection, unaffected.
- **Pipeline-counts duplicate-logic risk fixed, AND a real
  divergence found and corrected in the process:** extracted the
  counting logic (previously duplicated between `TemplatePage.tsx`'s
  Recalculate button and `initAppConfig.ts`'s `backfillPipelineCounts`)
  into one new shared, exported `computePipelineCounts()` function,
  now used by both. The two versions had genuinely disagreed on
  `total_active` for any task carrying an off-spec/legacy
  `pipelineStage` value (e.g. vestigial `logistics`/`installation`)
  — confirmed via direct code comparison before fixing, not assumed.
  Adopted the button's safer, explicit-allowlist behavior as the one
  true version. Ansh confirmed no real task currently carries such a
  value, so this fix's effect is preventive, not corrective, for
  today's real data — same category as the earlier `titleLower`-
  style dead-weight findings, closing a real gap before it's ever
  actually hit.
- **`appConfig` write-permission tightening** — see `PARKED.md` for
  full detail. Live-tested.
- **Code-splitting + error boundaries added** — see `PARKED.md` for
  full detail, including the measured 555KB→110KB bundle reduction.
  Live-tested.
- Also flagged during this session's write-audit, NOT fixed (out of
  scope for today): `assignStageTeamMember` and `reEngageLead` are
  both documented as "admin only" but neither has a code-level role
  check like `adminOverrideStage` does — presumably still protected
  by Firestore rules + UI gating, but a real, previously-undocumented
  inconsistency in how "admin only" is enforced. See `PARKED.md`.
- `npm run build` clean at every step; every diff verified
  line-by-line against spec; rules syntax validated via local
  emulator before deploying.
- **Deployed to `development-solarops` only** (the rules change) —
  the code changes (polling interval, pipeline-counts refactor,
  lazy-loading) are dev-only pending the next batched deployment,
  same as everything else currently queued.
