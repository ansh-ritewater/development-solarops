# SolarOps — Deployment & Work Tracker

**Last updated: 6 August 2026**

## Current deployment status

**Production (`solarops-ritesolar`) currently has, confirmed live:**
- Error logging system (errorLogs collection + /error-logs admin viewer)
- Full Sales Closed feature (detection, mapping panel, manual override,
  backfill tool, dashboard card, Tasks tab)
- Firestore automated backups (daily + weekly, 98-day retention) + PITR
- Dashboard/Tasks-page count-mismatch fixes, clickable dashboard cards,
  Sales Closed columns in Excel export (commit `5b57729`)
- The Firestore index required by the above (`archived+status+pipelineStage`)
  — confirmed present via direct gcloud check, 6 Aug 2026

**Production does NOT yet have (sitting in dev, committed, ready to deploy):**
- Commit `43207a6` — the `adminOverrideStage` status-corruption fix,
  the `reconcileStatusStageCorruption` repair tool, and `needsResurvey`
  (Full-Restart-to-Survey visibility fix). Confirmed absent from
  production via direct file-hash comparison, 6 Aug 2026.
- No new Firestore index is required for this deployment — it's pure
  application logic, no new query shapes.
- Two temporary admin diagnostic buttons ("Check Status/Stage
  Corruption", "Repair Status/Stage Corruption") currently sit in dev's
  Template → Admin Tools, deliberately left in place, waiting to be
  run against production once deployed — to find and repair whatever
  real corrupted-task count exists there (dev found and repaired 13;
  production's real count is currently unknown).

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

## Next deployment checklist (when ready)

**Note: never copy the docs/ folder to D:\SolarOps. Only copy the exact
files listed below.**

1. Copy these 12 files from dev to `D:\SolarOps` (corrected 12 Aug
   2026 — the previous 7-file list was verified incomplete: it
   omitted 4 files including a new util that TaskDetailDrawer.tsx
   imports, which would have broken the prod build):
   `src/components/offline/TaskQueueProcessor.tsx`,
   `src/components/pipeline/PipelineTracker.tsx`,
   `src/components/tasks/TaskDetailDrawer.tsx`,
   `src/firebase/initAppConfig.ts`,
   `src/hooks/usePipelineActions.ts`,
   `src/hooks/useTaskActions.ts`,
   `src/pages/DashboardPage.tsx`,
   `src/pages/TasksPage.tsx`,
   `src/pages/TemplatePage.tsx`,
   `src/utils/needsResurvey.ts` (new file),
   `src/utils/stageOrder.ts` (new file),
   `src/hooks/useTasks.ts` (State+Date/Due-Date filter fix, commit
   `f6437d6`)
1b. Also deploy 2 new Firestore indexes to production (currently
    only in dev): `tasks: archived+state+createdAt` and
    `tasks: archived+state+dueDate`. Run
    `firebase deploy --only firestore:indexes` from `D:\SolarOps`
    AFTER copying files, and wait for both to show `Enabled` in the
    Firebase Console before considering State+Date/Due-Date usable
    in production.
1c. `tsconfig.app.json` has one line in dev not present in prod:
    `"ignoreDeprecations": "5.0"`. Ansh's decision, 12 Aug 2026: leave
    as a dev-only tooling difference, no action needed — it only
    silences a TS deprecation warning locally and doesn't affect
    runtime behavior or the build output.
1d. `scripts/migrateTasks.ts` and `scripts/migrateTasksNode.mjs`
    exist only in dev — confirmed 12 Aug 2026 via direct read: both
    are standalone one-shot backfill utilities for `priorityScore`/
    `titleWords`, not imported anywhere in `src/`. Ansh's decision:
    leave dev-only, no action needed — they're standalone maintenance
    scripts, not part of the deployed app bundle.
2. Verify clean with `npm run build` in the prod folder — NOT
   `tsc --noEmit` alone. Confirmed 12 Aug 2026: `tsc --noEmit` run at
   the project root is a no-op on this project's solution-style
   tsconfig.json (it resolves zero input files and always exits 0,
   even against a deliberately broken tree). `npm run build` (which
   runs `tsc -b && vite build`) is the only command that actually
   type-checks the code — use that for every future verification.
3. Deploy hosting (no rules or index changes needed for this one)
4. Click "Check Status/Stage Corruption" on production — record the
   real count
5. Decide whether/when to click "Repair Status/Stage Corruption" on
   production
6. Once confident, remove both temporary diagnostic buttons from prod
   (and eventually dev)
