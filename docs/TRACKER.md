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

## Next deployment checklist (when ready)

1. Copy these 6 files from dev to `D:\SolarOps`:
   `src/components/tasks/TaskDetailDrawer.tsx`,
   `src/firebase/initAppConfig.ts`,
   `src/hooks/usePipelineActions.ts`,
   `src/pages/TasksPage.tsx`,
   `src/pages/TemplatePage.tsx`,
   `src/utils/needsResurvey.ts` (new file)
2. Verify `tsc`/build clean in the prod folder
3. Deploy hosting (no rules or index changes needed for this one)
4. Click "Check Status/Stage Corruption" on production — record the
   real count
5. Decide whether/when to click "Repair Status/Stage Corruption" on
   production
6. Once confident, remove both temporary diagnostic buttons from prod
   (and eventually dev)
