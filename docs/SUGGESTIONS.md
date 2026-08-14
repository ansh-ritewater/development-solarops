# SolarOps — Suggestions & Minor Findings

**Last updated: 13 August 2026**
This file holds items that are real and worth knowing, but do NOT
currently harm the system and are NOT actively planned work — unlike
`PARKED.md`, which is for things genuinely intended to be fixed
eventually. If something here ever becomes relevant (a real incident,
a design change that touches it, a team change), move it to
`PARKED.md` at that point. Otherwise it just sits here as reference.

## From the 10 Aug 2026 multi-AI audit (see TRACKER.md for methodology)

- **RESOLVED 13 Aug 2026** — `QueuedTaskUpdate` now carries
  `createdByUid`; `TaskQueueProcessor.tsx` skips syncing any item
  stamped for a different uid than whoever's logged in;
  `Header.tsx`'s logout clears queued items belonging to the
  logging-out user specifically. Live-tested (person A queues
  offline, logs out, person B logs in same device — confirmed not
  synced under B's identity). See `TRACKER.md`'s 13 Aug entry for
  full detail.
- **CLEARED 13 Aug 2026, not a real bug.** Investigated fresh: only
  one call site exists in the entire codebase (`useUserActions.ts`'s
  `createUser`) — nothing in the boot sequence or anywhere else calls
  it a second time. The function itself also already checks whether
  a `memberCounts` entry exists for that uid before writing one, so
  even a hypothetical second call would be a no-op. The suspected
  risk doesn't hold up under a direct read of the current code.
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
- **`errorLogs` still allows `create: if isAuth()`** — any
  authenticated user, any role, can write unlimited arbitrary log
  documents, with no rate limiting or App Check behind it. Confirmed
  12 Aug 2026, still open — the real fix needs infrastructure this
  app deliberately doesn't have (Cloud Functions/App Check).
- **RESOLVED 13 Aug 2026** — `invites`' read rule was tightened to
  require authentication unconditionally (`allow read: if isAuth();`),
  removing the clause that allowed an unauthenticated read for any
  `status: 'pending'` invite. Confirmed beforehand, via a full
  separate investigation, that the real "Create User" onboarding flow
  never touches this collection at all (it uses Firebase Auth's own
  `sendPasswordResetEmail` directly) — so this change cannot affect
  real user onboarding. See `TRACKER.md`'s 13 Aug entry.
