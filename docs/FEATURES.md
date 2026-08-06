# SolarOps — Feature Catalog

**Last updated: 6 August 2026**
**Note: this catalog reflects features discussed/built/verified in
recent sessions. It is not yet a complete inventory of the entire
application — see ARCHITECTURE.md (once built) for full coverage.**

## Core pipeline
6-stage lead pipeline: Survey → Proposal → Field Review → Documents →
Backend → Completed (Converted) / Dropped. Roles: admin, view_only,
field, proposal, backend, backend_manager (per earlier project notes —
verify current role list against `src/types/index.ts` before relying
on this).

## Admin Override — Quick Correction vs. Full Restart
One function (`adminOverrideStage` in `usePipelineActions.ts`), one
`isCorrection` flag distinguishes the two modes:
- **Quick Correction** (`isCorrection: true`) — moves the task and
  remembers the origin stage via `correctionReturnTo`, so resubmitting
  automatically snaps it back. Shows in the "Needs Correction" tab with
  an amber "Sent back for correction — will return to X" badge.
- **Full Restart** (`isCorrection: false`) — moves the task and clears
  all correction tracking. Used when you want the task to flow forward
  normally afterward rather than auto-return (e.g. sending a Backend
  task to Documents for a fix that should then continue to Backend as
  the next normal step — not auto-snap back).
- Correct usage rule (confirmed with Ansh): Quick Correction is for
  moving a task BACKWARD to an earlier stage for a fix. Full Restart is
  used more flexibly, including forward moves or stage-skips.
- A task Full-Restarted specifically to Survey gets a dedicated
  "↩ Restarted by admin — needs re-survey" badge (`needsResurvey.ts`),
  computed purely from existing data (last `stageHistory` entry) —
  never a stored field, never conflicts with the Quick Correction badge.

## Sales Closed detection
Automatically detects a closed deal from advance/token payment fields
(Type + Amount + Image, all three) filled in either the Survey or
Documents form. Admin maps which specific fields mean what via a
6-dropdown panel in Template page (avoids hardcoding field IDs, which
are unstable and admin-editable). Manual admin override available,
sticky (never silently reverted by later form edits). Dashboard card +
dedicated Tasks-page tab, both live in production.

## Error logging
`errorLogs` Firestore collection + admin-only `/error-logs` viewer.
Captures ~33 failure points across survey/documents/proposal/backend
submission, offline sync, uploads, and auth. Deliberately excludes
admin-triggered actions (admin sees failures immediately via toast).
Live in production.

## Firestore backups
Daily + weekly automated backups (98-day retention, the maximum
allowed) + point-in-time recovery (7-day rolling window), enabled
directly on production (requires Blaze plan, not available on dev).
Cloudinary automatic backup for photos/PDFs, separately configured.

## Dashboard & Tasks page
Real-time-ish stat cards (Total, Pending, In Progress, Completed,
Blocked, Sales Closed) and Pipeline Overview cards, all clickable,
deep-linking to the matching Tasks-page tab. Correction-flagged tasks
are shown in their true current stage/status tab (not hidden), matching
badge counts to what's actually visible.
