# SolarOps — Suggestions & Minor Findings

**Last updated: 10 August 2026**
This file holds items that are real and worth knowing, but do NOT
currently harm the system and are NOT actively planned work — unlike
`PARKED.md`, which is for things genuinely intended to be fixed
eventually. If something here ever becomes relevant (a real incident,
a design change that touches it, a team change), move it to
`PARKED.md` at that point. Otherwise it just sits here as reference.

## From the 10 Aug 2026 multi-AI audit (see TRACKER.md for methodology)

- **Stored XSS risk (unverified):** a task field containing a
  `javascript:` URL, if ever rendered directly in an `href`/`src` with
  no scheme restriction, could execute when an admin opens it. Flagged
  by one external audit source; never independently verified against
  the real code.
- **Offline queue has no owner-identity binding and never clears on
  logout.** On a genuinely shared device, one field engineer's queued
  offline data could sync under a different person's identity after
  they log in. Relevant only if devices are ever actually shared
  between team members.
- **`initMemberInCounts` may run both at user creation and again in the
  silent boot sequence** — a possible minor double-counting risk on a
  brand-new team member. Low consequence; team growth is infrequent.
- **`logError` captures full task context, including PII** (phone
  numbers, GPS, email) into the `errorLogs` collection. Exposure is
  limited since only admins can read that collection.
- **`view_only` role can navigate to pages Firestore rules actually
  deny them** (Team, Template, Reports, Error Logs) via the route
  guard — resulting in broken buttons/error screens for that role
  instead of a clean "not allowed" message. Cosmetic/UX only, cheap to
  fix whenever convenient.
- **Unresolved disagreement between two audit sources:** whether
  `stageHistory` is genuinely capped at every single write site, or
  whether `submitProposal`/`useTaskSubmit` specifically use `arrayUnion`
  without the cap. Never independently settled with a direct fresh
  code read. Not urgent, but `SCHEMA.md`/`PIPELINE_FLOW.md` currently
  state this is capped "everywhere" with more confidence than has
  actually been verified for these two specific functions.
