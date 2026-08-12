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
- **RESOLVED 12 Aug 2026, via direct code read:** `stageHistory` is
  capped at 7 of 10 write sites (`existingHistory.slice(-49)` in
  `usePipelineActions.ts` at the 7 stage-transition functions), but
  genuinely UNCAPPED at 3: `usePipelineActions.ts`'s `submitProposal`
  (line ~156, `arrayUnion` with no cap), `useTaskSubmit.ts`'s
  survey→proposal transition (line ~161, same pattern), and
  `TaskQueueProcessor.tsx`'s offline-queue drain (line ~260, same
  pattern). In practice this is self-healing — the next capped write
  trims any overgrown array back to 50 — so it's a documentation-
  accuracy issue, not an active bug. `SCHEMA.md`/`PIPELINE_FLOW.md`/
  `SCALABILITY.md` overstate the cap as universal; corrected there.
- **Two unauthenticated/under-protected surfaces in `firestore.rules`,
  confirmed 12 Aug 2026, not previously documented:** `errorLogs`
  allows `create: if isAuth()` — any authenticated user, any role,
  can write unlimited arbitrary log documents, with no rate limiting
  or App Check behind it. Separately, `invites` allows `read: if
  isAuth() || resource.data.status == 'pending'` — an unauthenticated
  party can read any still-pending invite, exposing name/email/role.
  Low practical risk: the invite-link system is already confirmed
  genuinely orphaned elsewhere in `PARKED.md` (`createInvite` has no
  caller anywhere in the UI).
