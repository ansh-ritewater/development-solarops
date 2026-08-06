# SolarOps — Parked Items

**Last updated: 6 August 2026**
Everything here is a known, deliberately deferred item. Nothing in
this list should be assumed fixed unless TRACKER.md says otherwise.

## Correction / Admin Override family (related bugs, not yet done)
- **Re-engage always sends a re-engaged dropped lead to Proposal**,
  regardless of where it actually came from — a lead dropped early
  (e.g. directly from Survey) gets wrongly routed to the Proposal team
  with no real proposal history behind it.
- **Pipeline tracker display bug** — always shows Field Review as
  "done" for any dropped task, even one dropped straight from Survey.
  Cosmetic only; real `stageHistory` data is correct and untouched.
- **`markLeadConverted` never clears correction pointers** — a lead
  converted to Completed while still flagged for correction stays
  permanently, incorrectly stuck showing in "Needs Correction."
- Never checked whether `completeJourneyStep`/`saveJourneyStepDraft`
  have this same gap.
- A UI guard to discourage/block Quick Correction on a forward move
  (prevention, since forward Quick Correction creates an unresolvable
  correction pointer).
- A manual "clear stuck correction flag" rescue action, for any task
  already stuck from misuse of the above.
- Theoretical edge case (zero real occurrences confirmed): an admin
  force-overriding a still-blocked/pending/in-progress Survey task
  directly to a later stage would leave `status` stuck at its
  pre-override value.
- Full Restart (`isCorrection: false`) was never separately live-tested
  for the status-corruption fix — shares the identical code path as
  Quick Correction, so expected to behave the same, but not
  independently verified by a live click-through.

## Structural / scaling risks (ahead of the 1-lakh-task goal)
- `appConfig/global` is a single Firestore document written by every
  stage transition — a write-contention risk as concurrent usage grows.
- Denormalized counters hand-maintained across ~13 separate code paths
  — real risk of silent drift if any path is missed in a future change.
- Dashboard's remaining 4 stat cards (Pending/In Progress/Completed/
  Blocked) still use `getDocs` with a hardcoded `limit(1000)` instead
  of `getCountFromServer` — will silently freeze with no warning if any
  bucket exceeds 1,000.
- Reports page's hard caps (5,000 rows for charts, 500 for recent
  submissions) will truncate well before 1 lakh tasks — truncation IS
  at least flagged in the UI, unlike the Dashboard issue above.
- 14+2 admin backfill/migration tools have zero query limit — real risk
  only if clicked once task count is very large. Not time-sensitive;
  the rule is "don't click any of these unpaginated tools at large
  scale without adding chunking first."

## Hygiene / hardening (low urgency, explicitly deferred)
- Prod Firestore index cleanup — ~10 old orphaned indexes never removed
  from production (dev was already cleaned up).
- Custom auth claims (to replace a per-request Firestore read for role
  checks).
- Tightening `appConfig` write permissions.
- Deciding `titleLower`'s fate (written but never queried — dead weight).
- Deleting vestigial logistics/installation code (folded into Backend
  long ago, never removed from types/rules/indexes).
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
