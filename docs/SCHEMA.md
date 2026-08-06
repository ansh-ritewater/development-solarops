# SolarOps — Data Schema Reference

**Last updated: 6 August 2026**
**Source: full read of `src/types/index.ts`, `firestore.rules`,
`firestore.indexes.json` on this date. This document reflects only
what is confirmed in those files — not assumption.**

## Collections overview

- `users/{uid}` — accounts
- `appConfig/{docId}` — single global config document (`appConfig/global`)
- `invites/{inviteId}` — pending signup invitations
- `tasks/{taskId}` — the core collection; every lead is one document
  - `tasks/{taskId}/updates/{updateId}` — subcollection, one per FE submission
  - `tasks/{taskId}/stages/{stageId}` — subcollection, per-stage records
- `errorLogs/{logId}` — application error log entries

## Realtime Database (separate from Firestore)

A second, separate Firebase service, exported as `rtdb` from
`src/firebase/config.ts`. Confirmed via a direct read of
`database.rules.json`, in full:
```json
{
  "rules": {
    "presence": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```
**One path exists in the whole tree: `presence/{uid}`.** Each entry
holds `{ online: boolean, lastSeen: number | ServerValue, name: string,
role: string }`.

- **Written by `usePresence.ts`** — every logged-in client writes only
  to its **own** `presence/{ownUid}` node: `{ online: true, lastSeen:
  Date.now(), name, role }` on mount, plus a Realtime-Database-native
  `onDisconnect(...).set({ online: false, lastSeen: serverTimestamp(),
  name, role })` handler that fires server-side if the client vanishes
  ungracefully (closed tab, lost connection). On a clean unmount/logout,
  it explicitly writes `{ online: false, lastSeen: serverTimestamp(),
  name: '', role: '' }` itself (name/role blanked, unlike the
  onDisconnect path which preserves them).
- **Read by `useOnlineUsers.ts`** — subscribes to the **entire**
  `presence` tree at once (`onValue(ref(rtdb, 'presence'), ...)`), only
  for `admin`/`view_only` roles (every other role's effect no-ops).
  "Online" is purely the boolean `online` flag — there is no staleness/
  heartbeat check against `lastSeen`, so a client that dies without
  triggering `onDisconnect` (rare, but possible on some network
  failures) could show as online indefinitely until it reconnects and
  writes `false` itself.

**⚠️ Security note, confirmed directly from the rule above**: the rule
is `auth != null` with **no per-uid scoping at all** — it does not
check `$uid === auth.uid`. Any authenticated user could, in principle,
write to *any other user's* `presence/{otherUid}` node directly via the
RTDB SDK/REST API; nothing in `database.rules.json` prevents it. The
actual restriction to "each user only writes their own presence" is
entirely a client-code convention (`usePresence.ts` always targets its
own uid) — not something the backend enforces. Not necessarily urgent,
but worth knowing this is app-code discipline, not a real security
boundary, if this project's threat model ever changes.

## Roles

`UserRole`: `admin | field | proposal | backend | logistics | installation | view_only | backend_manager`

**Note:** `logistics` and `installation` are confirmed still present in
types and security rules, but are understood (per project history) to
be vestigial — folded conceptually into `backend` long ago. They still
grant real task access in the rules file as written. Deleting this
vestigial surface is a parked cleanup item (see `PARKED.md`).

## AppConfig (`appConfig/global`)

Single document holding org-wide config and counters:
- `taskNumCounter`, `engineerNumCounter`, `proposalNumCounter?`, `backendNumCounter?`
- `taskTemplate: FieldDefinition[]` — the Survey form
- `documentTemplate?: FieldDefinition[]` — the Documents form
- `backendChecklistTemplate?`, `backendCashSteps?`, `backendLoanSteps?: JourneyStepDefinition[]`
- `pipelineCounts?` — denormalized counts per stage (`survey`, `proposal`,
  `field_review`, `documents`, `backend`, `completed`, `dropped`, plus
  `unassigned_proposal`, `unassigned_backend`, `total_active`)
- `memberCounts?`, `engineerCounts?`, `districtCounts?` — other denormalized stats
- `districts?`, `leadSources?`, `districtsByState?`
- `saleClosedConfig?` — the admin-configured field-mapping for Sales
  Closed detection (see below)
- `superAdminUid?`

## PipelineStage

`survey | proposal | field_review | documents | backend | completed | dropped`

(`completed` here means fully **Converted** — this is distinct from a
Task's own `status` field also having a value called `'completed'`,
which means something different — see below, this exact confusion
caused a real bug, documented in `KNOWN_ISSUES.md`.)

## Task (the core document — `tasks/{taskId}`)

**Identity & content:** `id`, `taskNum`, `title`, `titleLower?`,
`titleWords?` (search), `priorityScore?`, `description?`

**Location/lead info:** `district?`, `state?`, `leadSource?`,
`leadSourceEmployeeName?`, `leadGeneratedByUid?`, `leadGeneratedByName?`,
`leadGeneratedByNote?`

**Assignment:** `assignedTo` (the field engineer), `assignedToName`,
`assignedToCode`, `assignedToMobile?`, `consumerMobile?`

**Status & pipeline (the two fields that must never be confused):**
- `status: TaskStatus` = `pending | in_progress | completed | blocked`
  — reflects the engineer's own progress on the Survey (can be
  updated repeatedly — Pending → In Progress → Blocked → Completed —
  while the task is still at the Survey stage, via `UpdateTaskDrawer`).
  **It becomes frozen only once `pipelineStage` moves past `'survey'`**
  — no normal-flow function touches it after that point (the only
  exceptions are the deliberate paired writes in `markLeadConverted`
  and `adminOverrideStage`-to-`'completed'`, both documented in
  `PIPELINE_FLOW.md`). It should never be touched by any OTHER
  pipeline-stage move. (A real bug existed where `adminOverrideStage`
  incorrectly touched this on every move — fixed 6 Aug 2026, see
  `KNOWN_ISSUES.md`.)
- `pipelineStage?: PipelineStage` — which of the 6 real stages the
  task currently occupies, including the final `completed` (=Converted).

**Survey data:** `fields: FieldDefinition[]` (the form snapshot at
creation), `fieldAnswers`, `fieldPhotos`, `completionPhotos`,
`blockedReason`, `location`, `submittedBy`, `submittedAt`

**Housekeeping:** `createdBy`, `createdAt`, `updatedAt`, `archived`,
`archivedAt?`, `dueDate`, `followUpDate`

**Pipeline stage sub-objects (optional, populated as a task advances):**
`surveyData?`, `proposalData?`, `fieldReviewData?`, `backendData?`,
`logisticsData?`, `installationData?` — each with its own shape (see
full type definitions for field-level detail; broadly: proposal tracks
document revisions, field review tracks approve/reject notes, backend
tracks subsidy/portal status).

**Stage history:** `stageHistory?: StageHistoryEntry[]` — every
transition ever made, `{ fromStage?, toStage, timestamp, actorUid?,
actorName, actorRole, note? }`. This is the durable audit trail behind
several features (e.g. `needsResurvey` reads its last entry).

**Team assignment (proposal/backend/logistics/installation):**
`proposalAssignedTo?`, `proposalAssignedToName?`,
`backendAssignedTo?`, `backendAssignedToName?`,
`logisticsAssignedTo?`/`installationAssignedTo?` (+Name) — vestigial,
see role note above.

**Correction tracking (Quick Correction mechanism):**
`correctionReturnTo?: PipelineStage | null` — set when a task is sent
back for a fix; tells the resubmit logic where to auto-return it.
`correctionReturnAssignedTo?`, `correctionReturnAssignedToName?`,
`correctionNote?`, `correctionSetAt?`.
**Full Restart deliberately clears all of these** — that's the
functional difference between the two Admin Override modes.

**Remarks:** `backendRemark?`/`proposalRemark?` (+ `UpdatedBy`/`UpdatedAt`)

**Documents stage:** `documentAnswers?: Record<string,string>`,
`documentPhotos?`, `documentsCompleted?`

**Sales Closed:** `saleClosed?: boolean`, `saleClosedSource?: 'auto' | 'manual' | null`
— computed from `computeSaleClosedEvidence()`, never written directly
except by the manual-override admin action or the reconcile/backfill tool.

**Backend Application Journey:** `paymentType: 'cash' | 'loan' | null`,
`applicationJourneySteps: JourneyStepAnswer[]`, `currentStepIndex`,
`journeyCompleted?`

**Droped reason:** `droppedReason?: string | null`

## TaskUpdate (subcollection `tasks/{taskId}/updates/{updateId}`)

One record per FE submission: `submittedBy`, `submittedByName`,
`submittedAt`, `status`, `location`, `blockedReason`, `fieldAnswers`,
`fieldPhotos`, `completionPhotos`, `taskNum`, `title`. Read-only after
creation (rules: `allow update: if false; allow delete: if false;`).

## QueuedTaskUpdate (offline queue, client-side only — IndexedDB, not Firestore)

Mirrors a subset of Task fields for a pending offline sync: `taskId`,
`taskNum`, `title`, `previousStatus`, a `payload` object (status,
blockedReason, fieldAnswers, fieldPhotos, location, followUpDate,
submittedAt, fields?, completionPhotos?), plus `queuedAt`, `attempts`,
`lastError?`, `historyWritten?`.

## Invite (`invites/{inviteId}`)

`name`, `email`, `role`, `status: pending | accepted | revoked`,
`createdBy`, `createdAt`, `expiresAt`, `acceptedAt?`, `revokedAt?`.
Readable unauthenticated only while `status == 'pending'` (signup flow).

## Security rules — key points

- **`users`**: anyone authenticated can read; only admin can write.
- **`appConfig`**: anyone authenticated can read; **admin, field,
  proposal, and backend can all write** — broad, because client-side
  transactions need to update denormalized counters. No field-level
  restriction exists (confirmed) — this is a known tradeoff, not a bug.
- **`invites`**: admin-only write; public read only for pending invites.
- **`tasks`**: read/update access is role + assignment based (e.g. field
  can only touch their own assigned tasks; proposal can read any task
  currently at the proposal stage OR their own assigned ones). **Only
  admin can create or delete a task.** No field-level write restriction
  exists on `tasks` either (confirmed) — any role permitted to update a
  task can update any field on it.
- **`tasks/{id}/updates`**: create-only, immutable after — a genuine
  audit log.
- **`tasks/{id}/stages`**: similar role/assignment gating to the parent task.
- **`errorLogs`**: any authenticated user can create; only admin can read.

## Indexes

`firestore.indexes.json` currently declares composite indexes almost
entirely on the `tasks` collection, covering: archived+status/pipelineStage
combinations, per-role assignment lookups (`assignedTo`,
`proposalAssignedTo`, `backendAssignedTo`), search (`titleWords`
array-contains, `consumerMobile`), correction queries
(`correctionReturnTo`), district/stage combinations, and — added
recently — `saleClosed` (2 indexes) and the `status+pipelineStage`
exclusion query used by the Blocked/Pending/In Progress fix.
**Exact current count and full enumeration:** see `firestore.indexes.json`
directly — this document summarizes shape, not a maintained duplicate list.
