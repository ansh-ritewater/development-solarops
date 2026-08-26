# Backend Roadmap Audit (Pass 3)

**Investigated 21 August 2026 via fresh, direct code reads.** Pure
documentation — nothing fixed. Companion to `FILTER_AUDIT.md` (Pass 1)
and `FEATURE_AUDIT.md` (Pass 2).

## Correction to prior framing

There is no literal "Phase 2-6" structure anywhere in this project's
docs — only one consolidated 6-item backend-dependent list, in
`PARKED.md`. `templateVersion` migration is NOT part of that list —
it's tracked separately in `PERFORMANCE.md` as a performance
optimization, doesn't need Cloud Functions, and was incorrectly
grouped with the backend list in earlier conversation. Corrected here.

## The 6 backend-dependent items — all reconfirmed fresh, zero drift

App Check (zero integration), errorLogs rate-limiting (still
`allow create: if isAuth();`, no cap), custom auth claims (zero
`setCustomUserClaims` usage anywhere), counter centralization (still
zero Cloud Functions own any counter write), push notifications
(`fcmToken` still fully dormant — written `null`, never populated,
zero messaging/scheduler code anywhere). All exactly as previously
documented, nothing changed since.

## The role-check gap, precisely sized — 29 functions, not a vague count

Full list in the investigation transcript (function + file + line,
29 entries). Broken down by what's actually needed:

- **22 of 29**: a simple `if (currentUser.role !== 'admin') throw ...`
  is correct and sufficient — real hardening, though Firestore's
  rules already block the actual abuse case today.
- **5 of 29** (`backfillEngineerDistrictCounts`,
  `reconcilePipelineCounts`, `backfillPipelineCounts`,
  `backfillMemberCounts`, and the general `pipelineCounts`/
  `engineerCounts`/`districtCounts`/`memberCounts` category): need
  `firestore.rules`' `appConfig` update rule tightened too, not just
  the function — these fields are currently in the non-admin
  allowed-keys list.
- **6 of 29** (Template Save functions — `saveTemplate`,
  `saveDocumentTemplate`, `saveBackendJourneySteps`,
  `saveSaleClosedConfig`, `saveDistrictsByState`, `saveLeadSources`):
  need the UI condition fixed too. Confirmed two distinct sub-cases:
  most are gated by `!isViewOnly` (wrong — should be `isAdmin`, since
  the rule already requires admin for these fields); one
  (`saveBackendJourneySteps`) has no visibility gate at all.
- **1 of 29** (`UpdateTaskDrawer`'s admin-edit `handleSubmit`, line
  301): **needs a structural fix, not a role check.** This single
  shared component handles both an ordinary field engineer's own
  survey update AND an admin's metadata edit (title/district/lead
  source/reassignment) — against the exact same rule condition
  (`resource.data.assignedTo == request.auth.uid`), which checks
  WHICH task, never WHICH FIELDS. A field engineer could, in
  principle, use this same form to make admin-only edits on their own
  assigned task. Real fix: split the write path, or add field-level
  rule restrictions the way `appConfig` already correctly does with
  `affectedKeys().hasOnly([...])`.

## Confirmed: custom auth claims are NOT a prerequisite for any of
the 29 fixes above

All fixable today with client code plus, for a subset, rules edits —
zero Cloud Functions or new backend infrastructure required. Custom
claims remain a separate, standalone performance/architecture
improvement (removing a per-request Firestore read for every role
check), not a blocker for closing any of these gaps.

## Confirmed: the Search+State/Lead-Source regression needs zero
backend work

Purely a frontend fix — `canUseAlgolia` (TasksPage.tsx) never checks
Search, and the search-applying code path only runs on Algolia
failure, never success. Fixable entirely client-side.

## Two genuinely new findings, not tracked anywhere until this pass

1. **The "UI-vs-rules mismatch" pattern itself** is not captured as a
   trackable item anywhere in `PARKED.md`'s consolidated list.
2. **`UpdateTaskDrawer`'s field-level gap** (above) — sharper and more
   concrete than Pass 2's general "missing role check" finding; only
   surfaced by this pass's direct cross-reference against the real
   `tasks` update rule.
