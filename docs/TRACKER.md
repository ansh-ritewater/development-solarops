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
- Uncommitted, held for a bundled commit with other pending changes

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
- Uncommitted, held for a bundled commit with other pending changes

**Session — 7 August 2026, part 3 (parked-item fix):**
- Converted Dashboard's remaining 4 stat cards (Pending/In Progress/
  Completed/Blocked) from `getDocs(...limit(1000))` to
  `getCountFromServer`, matching the pattern already proven for the
  Total card — removes the silent 1,000-row ceiling with zero data
  visibility, no where() clause changed
- Confirmed live: all four numbers render correctly, browser console
  shows no index/precondition error, query shape unchanged from the
  already-indexed getDocs version so no new index was needed
- Uncommitted, held for a bundled commit with other pending changes

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

## Next deployment checklist (when ready)

**Note: never copy the docs/ folder to D:\SolarOps. Only copy the exact
files listed below.**

1. Copy these 6 files from dev to `D:\SolarOps`:
   `src/components/tasks/TaskDetailDrawer.tsx`,
   `src/firebase/initAppConfig.ts`,
   `src/hooks/usePipelineActions.ts`,
   `src/pages/TasksPage.tsx`,
   `src/pages/TemplatePage.tsx`,
   `src/utils/needsResurvey.ts` (new file)
1a. Also include `src/components/offline/TaskQueueProcessor.tsx` (the
    15MB→10MB/20MB toast-text fix) in the file copy — small, unrelated
    to the corruption fix, but also uncommitted and ready.
2. Verify `tsc`/build clean in the prod folder
3. Deploy hosting (no rules or index changes needed for this one)
4. Click "Check Status/Stage Corruption" on production — record the
   real count
5. Decide whether/when to click "Repair Status/Stage Corruption" on
   production
6. Once confident, remove both temporary diagnostic buttons from prod
   (and eventually dev)
