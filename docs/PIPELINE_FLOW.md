# SolarOps — Pipeline & Business Logic Flow

**Last updated: 6 August 2026**
**Source: full read of `src/hooks/usePipelineActions.ts`,
`src/hooks/useTaskSubmit.ts`, `src/utils/computeSaleClosed.ts`,
`src/utils/needsResurvey.ts`, `src/utils/taskScoring.ts`,
`src/utils/findLeastLoadedUser.ts` on this date. This document reflects
only what is confirmed in those files — not assumption.**

## The 6-stage pipeline, and what moves a task between stages

```
Survey → Proposal → Field Review → Documents → Backend → Completed
                                       ↓
                                    Dropped
```

| Transition | Handled by |
|---|---|
| Survey → Proposal (or correction-return stage) | `submitTaskUpdate` in `useTaskSubmit.ts` (Step 2), only when `status` is set to `'completed'` in the same submission |
| Proposal → Field Review (or correction-return stage) | `submitProposal` |
| Field Review → Documents / Backend (accepted) | `submitFieldReviewDecision(decision: 'accepted')` |
| Field Review → Dropped (rejected) | `submitFieldReviewDecision(decision: 'rejected')` |
| Field Review → Proposal (revision requested) | `submitFieldReviewDecision(decision: 'revision')` |
| Documents → Backend (or correction-return stage) | `submitDocuments` |
| Backend → Completed | `markLeadConverted` (fires once the last Application Journey step is done) |
| Dropped → Proposal | `reEngageLead` (admin only) |
| **Any** stage → **any** stage, manually | `adminOverrideStage` (admin only — see below) |

Every one of these (except `adminOverrideStage` and `reEngageLead`)
calls the shared helper `resolveCorrectionReturn(taskData,
normalNextStage)` before deciding where the task actually goes: if the
task has a live `correctionReturnTo`, it overrides the normal next
stage with the stored return stage (and restores the stored assignee).
This is the mechanism that makes Quick Correction "auto-snap back" —
every normal forward-submission function checks for it, unconditionally.

## Every exported function in `usePipelineActions.ts`

- **`resolveCorrectionReturn(taskData, normalNextStage)`** — module-level
  helper (not part of the hook's returned object). Reads
  `correctionReturnTo` off the task; if set, redirects the caller to
  that stage instead of the normal next stage and returns the stored
  return-assignee. This is the single shared mechanism behind Quick
  Correction's auto-return behavior.
- **`submitProposal(taskId, documents, note?)`** — Proposal → Field
  Review (or correction-return stage). Archives the current proposal
  into `revisions` before overwriting, writes the new documents, updates
  `pipelineStage`/`priorityScore`/pipeline counts, clears or restores
  correction fields, auto-assigns Backend if landing there unassigned.
- **`assignStageTeamMember(taskId, stage, assigneeUid, assigneeName)`**
  — admin manually assigns/unassigns a Proposal or Backend team member;
  keeps `memberCounts` and `unassigned_*` counters in sync.
- **`submitFieldReviewDecision(taskId, decision, revisionNote, taskData)`**
  — three sub-flows in one function: `accepted` → Documents or Backend
  (skips Documents entirely if no document template is configured);
  `rejected` → Dropped, with `droppedReason`; `revision` → back to
  Proposal, incrementing `proposalRevisionCount`.
- **`submitDocuments(taskId)`** — Documents → Backend (or
  correction-return stage). Recomputes Sales Closed evidence from
  survey + documents answers before writing, clears correction fields,
  auto-assigns Backend.
- **`initializeJourneySteps(taskId, paymentType, steps)`** — sets up the
  Backend Application Journey step list once payment type is chosen;
  resets `currentStepIndex` to 0.
- **`completeJourneyStep(taskId, stepIndex, realDate, photoUrls, currentSteps)`**
  — marks one journey step `'done'`, advances `currentStepIndex`, sets
  `journeyCompleted: true` if it was the last step.
- **`markLeadConverted(taskId, steps, paymentType)`** — Backend →
  Completed. Writes the final backend stage doc, sets `status:
  'completed'` **and** `pipelineStage: 'completed'` together in the same
  update, increments engineer/district completed counts.
- **`saveJourneyStepDraft(taskId, stepIndex, draftValue, draftDate, currentSteps)`**
  — saves a `'no'` answer + date on a step without marking it done or
  advancing `currentStepIndex`.
- **`saveJourneyStepRemark(taskId, stepIndex, text, currentSteps)`** —
  appends a remark to a step; throws if that step is already `'done'`
  (remarks lock once a step is complete).
- **`updateBackendRemark(taskId, text)`** — overwrites the task-level
  backend remark (cross-team visible).
- **`updateProposalRemark(taskId, text)`** — overwrites the task-level
  proposal remark (internal to Proposal team).
- **`reEngageLead(taskId, note)`** — Dropped → Proposal only. Throws if
  the task isn't actually at `pipelineStage: 'dropped'`; silently
  refuses (toast, no throw) if the task is archived. Auto-assigns a
  Proposal team member.
- **`adminOverrideStage(taskId, newStage, note, isCorrection = false)`**
  — admin-only manual move to **any** stage. See the dedicated section
  below.

## Admin Override — Quick Correction vs. Full Restart

One function, `adminOverrideStage`, one boolean parameter,
`isCorrection`, controls both modes. Both modes go through the exact
same stage-move, priority-score, and pipeline-count logic — the only
code difference between them is what happens to the correction-tracking
fields:

**`isCorrection: true` (Quick Correction)** sets:
- `correctionReturnTo` = the stage the task was moved **from**
  (`currentStage`, captured before the move)
- `correctionReturnAssignedTo` / `correctionReturnAssignedToName` = the
  previous Proposal or Backend assignee (whichever the task was leaving),
  so it can be restored automatically later
- `correctionNote` = the admin's note (or a generated default)
- `correctionSetAt` = now
- if the destination is Survey specifically, also clears `followUpDate`
  and `dueDate`

**`isCorrection: false` (Full Restart)** clears all five of the above
to `null`/`''` — no return pointer is kept at all. The task simply
moves and continues forward normally from wherever it lands.

**Confirmed business rule, per project history:** Quick Correction is
meant for moving a task **backward** to an earlier stage for a fix
(the return pointer only makes sense if there's a "forward" to return
to). Full Restart is meant to be used more flexibly — including forward
moves or stage-skips — since it deliberately keeps no return pointer.

**⚠️ Flag — this rule is not enforced by the code.** `adminOverrideStage`
performs zero validation on the relationship between `currentStage` and
`newStage` for either value of `isCorrection`. Nothing stops an admin
from calling it with `isCorrection: true` on a **forward** move (e.g.
Proposal → Backend with `isCorrection: true`) — the function will
happily set `correctionReturnTo: 'proposal'` even though the task is
now sitting past that stage, which would create a return pointer that
can never sensibly resolve. This matches a pre-existing parked item
(`PARKED.md`: "A UI guard to discourage/block Quick Correction on a
forward move") — confirmed still open as of this read; nothing in this
document's source files adds that guard.

The one place `isCorrection` does **not** matter: the `status` field.
`status` is only ever touched when `newStage === 'completed' &&
currentStatus !== 'completed'` (sets it to `'completed'`) — completely
independent of `isCorrection`. This is the fix from the 6 Aug 2026
session (see `KNOWN_ISSUES.md`): before that fix, `status` was
incorrectly reset to `'pending'` on nearly every override move
regardless of `isCorrection`.

One consequence confirmed directly by this read, matching a listed
`PARKED.md` edge case: if an admin overrides a Survey task (still
`status: 'pending'`/`'in_progress'`/`'blocked'`) straight to a later
stage, `status` is left completely untouched — it stays at whatever it
was before the override, since the only `status`-writing condition
requires the destination to be `'completed'`.

## `needsResurvey.ts` — surfacing Full-Restart-to-Survey tasks

```ts
export function needsResurvey(task): boolean {
  if (!task.pipelineStage || task.pipelineStage !== 'survey') return false;
  if (task.correctionReturnTo) return false;
  const history = task.stageHistory ?? [];
  if (history.length === 0) return false;
  const last = history[history.length - 1];
  return last.actorRole === 'admin_override' && last.toStage === 'survey';
}
```

**Confirmed exactly matches the description given:** it exists because
a task Full-Restarted back to Survey (`isCorrection: false`, destination
`'survey'`) looks, from the data alone, identical to a brand-new task
that has simply never left Survey — both have `pipelineStage: 'survey'`
and no `correctionReturnTo`. Without this helper, a field engineer would
have no way to tell "this needs a completely fresh re-survey because an
admin sent it back" apart from "this is a normal new lead."

It reads only existing fields — `pipelineStage`, `correctionReturnTo`,
and the last entry of `stageHistory` (checking `actorRole ===
'admin_override'` and `toStage === 'survey'`, which is exactly what
`adminOverrideStage`'s `entry` object writes, confirmed above) — and
never writes anything. It's deliberately mutually exclusive with a live
Quick Correction: the `if (task.correctionReturnTo) return false` guard
means a task with an active correction pointer is always handled by the
existing Quick Correction UI instead, never both at once.

## `computeSaleClosed.ts` — Sales Closed detection rule

```ts
export function computeSaleClosedEvidence(task, config): boolean {
  // qualifies if EITHER the survey field-set OR the documents field-set
  // has ALL THREE of: Payment Type answered, Amount answered, Image present
}
```

A lead counts as Sales Closed when **all three** of Type, Amount, and
Image are present in **either** the Survey form's answers or the
Documents form's answers (`hasAllThree` is checked against both
independently, OR'd together — confirmed: `surveyQualifies ||
documentsQualifies`). Answers can be shaped either as `{ value: string
}` (survey) or a plain `string` (documents) — `readAnswer()` normalizes
both.

`SaleClosedConfig` (`{ survey: SaleClosedFieldMap, documents:
SaleClosedFieldMap }`, each with `typeFieldId`/`amountFieldId`/
`imageFieldId`) is what lets this avoid hardcoding actual field IDs:
those IDs are admin-editable per org (set via the mapping panel on the
Template page), so the detection logic stays generic and just asks
"whichever field the admin says means Payment Type — is it filled?"
This function is pure — no Firestore access, tolerant of a missing
config (`if (!config) return false`) — and deliberately does **not**
consider `pipelineStage` or manual-override state; that's left entirely
to the caller (every call site checks `saleClosedSource !== 'manual'`
before applying the computed result, confirmed across
`useTaskSubmit.ts`, `submitDocuments`, and the other write sites audited
earlier this project).

## `taskScoring.ts` and `findLeastLoadedUser.ts`

**`taskScoring.ts`** exports two pure functions:
- `computePriorityScore(pipelineStage, status)` — returns a fixed
  ordinal number used for sorting Tasks-page lists (ascending — lower
  number sorts first/shown-first). Backend is the highest priority
  (`0`), then Field Review (`1`), Documents (`2`), Proposal (`3`), then
  Survey sub-ordered by `status` (`in_progress` → `blocked` → `pending`
  → `completed`, scores `4`-`7`), then Dropped (`8`) and Completed (`9`)
  sink to the bottom.
- `computeTitleWords(title)` — splits a title into lowercase words (plus
  the full lowercased phrase) for Firestore `array-contains` search
  indexing.

**`findLeastLoadedUser.ts`** exports two functions:
- `findLeastLoadedUser(role)` — read-only; picks the active
  Proposal/Backend user with the lowest `memberCounts` value (ties
  broken alphabetically by name). O(1) via the denormalized counter
  rather than counting live tasks.
- `assignLeastLoaded(taskId, role, uidField, nameField)` — the actual
  atomic assignment: re-fetches users outside the transaction, then
  inside a `runTransaction` re-picks the best candidate from a **fresh**
  read of `memberCounts` (to avoid a stale pick under concurrent
  assignment), writes the assignment to the task, and increments that
  user's `memberCounts` in the same transaction. Returns the assigned
  `{ uid, name }` (read back after the transaction) or `null` if nothing
  could be assigned.

## Survey submit flow (`useTaskSubmit.ts`) — why the two-step write matters

`submitTaskUpdate` is actually a **three-step** flow, not two:

**Step 1 — main data write** (`updateDoc` on the task doc): `status`,
`priorityScore`, `blockedReason`, `fieldAnswers`, `fieldPhotos`,
`location`, `followUpDate`, `submittedBy/At`, plus the recomputed Sales
Closed fields. Retried up to 3 times with a short backoff on transient
errors; a `permission-denied` error throws immediately (no point
retrying). If all 3 attempts fail, the submission is saved to an
**offline queue** instead (`enqueueTaskUpdate`) so the field engineer's
work is never lost, and the function returns early.

**Step 2 — pipeline transition**, gated behind `if (data.status ===
'completed')` — i.e. this only runs at all if the survey was actually
being marked complete, not for an in-progress/blocked/pending save. Runs
`resolveCorrectionReturn` to pick the real target stage, writes the
`surveyData` stage-subcollection doc, updates `pipelineStage` +
`stageHistory` + pipeline counts, and auto-assigns Proposal/Backend if
landing there unassigned. **This is also retried up to 3 times
independently of Step 1.** If it ultimately fails after 3 attempts, the
user sees: *"Submission saved, but the stage transition failed. Admin
has been notified."* — Step 1's data is already durably committed by
this point regardless.

**Step 3 — immutable update history** (`addDoc` to
`tasks/{taskId}/updates`): best-effort, wrapped in its own try/catch
that only logs on failure — never blocks or fails the overall
submission.

**Why the Step 1/Step 2 split matters:** a task's actual survey data
(answers, photos, location, status) can be fully and durably saved even
if the stage-transition step fails for some reason (a transient
Firestore error, a permission edge case, etc.). Without this split, a
failed transition could look to the field engineer like their entire
submission was lost, when in fact only the pipeline-stage bookkeeping
step didn't complete — the real risk this leaves is a task stuck with
`status: 'completed'` but `pipelineStage` still `'survey'` (the exact
stuck-transition scenario documented as a structural risk in
`PARKED.md`, and the reason the Dashboard/Tasks-page count fixes from
the 5b57729 session had to explicitly exclude `pipelineStage in
['dropped','completed']` from the Pending/In Progress/Blocked queries).
