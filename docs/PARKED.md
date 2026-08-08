# SolarOps — Parked Items

**Last updated: 6 August 2026**
Everything here is a known, deliberately deferred item. Nothing in
this list should be assumed fixed unless TRACKER.md says otherwise.

## Correction / Admin Override family (related bugs, not yet done)
- Confirmed 7 Aug 2026 via direct code read: `completeJourneyStep` and
  `saveJourneyStepDraft` never touch `pipelineStage`, `status`, or any
  correction-tracking field — they only ever update journey-step data
  within the Backend stage. Not the same bug family as
  `markLeadConverted`/`reEngageLead`; no fix needed.
- Theoretical edge case (zero real occurrences confirmed): an admin
  force-overriding a still-blocked/pending/in-progress Survey task
  directly to a later stage would leave `status` stuck at its
  pre-override value.

## Structural / scaling risks (ahead of the 1-lakh-task goal)
- `appConfig/global` is a single Firestore document written by every
  stage transition — a write-contention risk as concurrent usage grows.
- Denormalized counters hand-maintained across ~13 separate code paths
  — real risk of silent drift if any path is missed in a future change.
- Reports page's hard caps (5,000 rows for charts, 500 for recent
  submissions) will truncate well before 1 lakh tasks — truncation IS
  at least flagged in the UI (unlike the old Dashboard stat-card issue,
  now fixed).
- **Full accounting of all 17 `initAppConfig.ts` functions (confirmed
  6 Aug 2026, replaces an earlier imprecise count):** 3 run
  unconditionally on every single admin Dashboard page load
  (`initAppConfig`, `ensureSuperAdmin`, `reconcilePipelineCounts`) — 8
  run once per browser via a `localStorage` flag, not a server-side
  marker (`syncUserTaskCodes`, `migratePipelineStages`,
  `backfillPipelineAssignments`, `initBackendJourneySteps`,
  `backfillJourneyCompleted`, `migrateLogisticsToBackend`,
  `backfillMemberCounts`, `backfillCreatedBy`) — 1 runs automatically at
  user creation (`initMemberInCounts`) — 3 have real Admin Tools
  buttons (`reconcileSaleClosed`, `reconcileStatusStageCorruption`,
  `backfillEngineerDistrictCounts`) — 1 is duplicated by a separately-
  maintained inline copy instead of ever being called directly
  (`backfillPipelineCounts`, see the drift-risk bullet below) — 1 has
  zero caller found anywhere (`backfillTitleLower`, genuinely orphaned).
  **Worth knowing: the 8 `localStorage`-gated boot functions run real
  batch writes completely silently — no toast on success or failure,
  only `console.error` — and a new device/cleared browser re-triggers
  all of them again, since the gate is client-side, not server-side.**
- Separately, 4 Admin Tools buttons ("Recalculate Pipeline Counts",
  "Check Status/Stage Corruption", "Migrate Existing Districts to
  Maharashtra", "Migrate Historical Reverted Tasks") run their OWN
  inline logic in TemplatePage.tsx rather than calling the matching
  initAppConfig.ts function — meaning "Recalculate Pipeline Counts" and
  `backfillPipelineCounts()` are two separately-maintained
  implementations of the same idea, a real drift risk if only one is
  ever updated.
- **⚠️ "Migrate Historical Reverted Tasks" (TemplatePage.tsx Admin
  Tools) can undo the 6 Aug 2026 status-corruption fix, going forward.**
  Confirmed by direct code read: it resets `status` to `'pending'` on
  any candidate task currently at `status: 'completed'` — which, after
  the fix, is now the CORRECT state for a backward-Full-Restarted task,
  not a bug to repair. It also decides whether to retroactively add
  correction tracking purely by checking if the admin's note matches
  the auto-generated default text — an imperfect heuristic that could
  convert a deliberate Full Restart into a tracked Quick Correction.
  Ansh's decision (6 Aug 2026): do NOT click this button until it's
  reviewed/fixed. Not urgent to fix immediately since nobody is
  clicking it, but the underlying code is unchanged and still risky —
  this is a deferred decision, not a resolved one.

## Hygiene / hardening (low urgency, explicitly deferred)
- Prod Firestore index cleanup — ~10 old orphaned indexes never removed
  from production (dev was already cleaned up).
- Custom auth claims (to replace a per-request Firestore read for role
  checks).
- Tightening `appConfig` write permissions.
- Deciding `titleLower`'s fate (written but never queried — dead weight).
- Deleting vestigial logistics/installation code (folded into Backend
  long ago, never removed from types/rules/indexes).
- `BackendStageData`'s legacy fields (`subsidyApplied`, `subsidyStatus`,
  `portalRegDate`, `sanctionLetterUrl`, `notes`) appear unused in the
  current write path — only `applicationJourneySteps`/`paymentType`/
  `completedAt`/`completedByUid`/`completedByName` are ever written to
  `stages/backend` now. Candidate for the same cleanup pass.
- `AppConfig.backendChecklistTemplate` is seeded but never read or
  written anywhere in TemplatePage.tsx — fully superseded by the
  Cash/Loan Application Journey editor. Same cleanup candidate.
- The entire invite-link signup system (`invites` collection,
  `SignupPage.tsx` at `/signup/:inviteId`, `useInviteActions.ts`) is
  confirmed genuinely orphaned — `createInvite` is never called from
  anywhere in the UI. The real, actually-used account-creation flow is
  TeamPage's "Create User" (secondary Auth app + password-reset email).
  Candidate for deletion, or for actually wiring up if ever wanted as a
  real feature — currently neither used nor removed.
- A documented rollback plan for a bad production deploy, beyond
  "restore the previous zip."
- Rate-limiting / abuse protection on write paths.
- `npm audit` / dependency vulnerability scanning as a routine habit.
- Real external error monitoring/alerting (Sentry-style) — currently
  only the in-app `/error-logs` viewer exists; nobody gets proactively
  notified of a failure.
- An unspecified issue Ansh found in the Excel export related to Sales
  Closed — beyond the missing-columns gap already fixed. Details not
  yet given.
