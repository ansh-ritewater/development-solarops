# SolarOps — Feature Catalog

**Last updated: 13 August 2026**
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

## Task Detail Drawer (`TaskDetailDrawer.tsx`) — the admin/view-only lens on a task

Opened from a Tasks-page card tap for admin/view-only users (field
engineers instead open `UpdateTaskDrawer` for an active survey, or this
same drawer read-only for archived tasks). Everything below is admin-
editable inline unless noted; view-only sees the same layout with all
editing controls hidden.

**Header banners** — shown above everything else when applicable:
correction summary (amber, "↩ Sent back for correction — will
automatically return to X once resubmitted", plus the stored reason if
any), and the separate `needsResurvey` amber banner ("↩ Restarted by
admin — needs re-survey") — the two are mutually exclusive by design
(see `PIPELINE_FLOW.md`).

**Sales Closed control** (admin only) — toggle Mark/Unmark as Sales
Closed, shows `(auto-detected)` or `(manually set)`, with a "Reset to
automatic" link once manually set.

**Inline-editable meta fields**, each independently editable in place
(hover reveals a pencil icon, edit mode is a small form with Save/Cancel,
all disabled once the task is archived):
- **Title** — textarea, 2 rows.
- **Assigned engineer** — reassign via a searchable engineer combobox;
  shows the engineer's mobile as a tap-to-call link if present.
- **Due date** — date picker.
- **Description** — free text.
- **Consumer Mobile** — digits-only, exactly 10 required to save; runs
  the same duplicate-mobile check as task creation (see below) and warns
  (not blocks) if the number already exists on another lead.
- **District / State** — paired comboboxes; changing state clears the
  district selection.
- **Lead Source** — combobox; `Employee` reveals an employee-name text
  field, `Field Engineer` reveals an engineer combobox + optional note.

**Read-only informational sections**: follow-up date (if set), blocked
reason (if status is blocked), the full Survey form's answered fields
(grid of cards, unanswered fields dimmed, photos inline), completion
photos, GPS location with an "Open in Maps" link, the pipeline stage
tracker (`PipelineTracker`) plus a "days in current stage" chip once
past Survey, and the Backend Application Journey progress (step list
with done/current/future states, per-step remarks, payment type).

**Stage-specific sections** (shown even after the task has moved past
that stage, explicitly labeled "(from earlier stage)" when historical):
Proposal documents + revision history (admin read-only), a proposal
note, submitted Documents-form answers/photos, and an editable Backend
Remark / Proposal Remark (each independently editable only while the
task is actually at that stage; both display historically otherwise).

**Assignment sections** (admin only): Proposal team assignment (pick
from active proposal-role users, shows each one's current active-task
count) — only editable while the task is actually at the Proposal
stage; Backend team assignment (dropdown, same active-count display) —
only editable while at the Backend stage.

**Submission History** — every past survey submission
(`tasks/{id}/updates`), newest first, collapsed to a preview of 3 with
"Show all N" expand; each entry expands to show status, blocked reason,
GPS, every field answer, and any photos from that specific submission.

**Footer actions** (admin only, all gated on the task not being
archived unless noted):
- **Edit** — opens the admin edit flow (separate from a field
  engineer's survey-update flow).
- **Re-engage Lead** — only shown for Dropped tasks; moves the lead back
  to Proposal with an optional note (see `PIPELINE_FLOW.md`).
- **Admin Override** ("🔧 Override Pipeline Stage") — pick any stage
  (excluding the current one) and either **↩ Quick Correction** or
  **Full Restart**, each gated behind a `window.confirm` describing what
  it will do (Quick Correction explicitly tells the admin it will
  auto-return; Full Restart explicitly warns "downstream progress will
  not be preserved").
- **Archive / Restore** — archiving requires an inline confirm step;
  restoring an archived task is a single click.

## Editing vs. submitting a task — two distinct flows

**Field engineer survey update** (`UpdateTaskDrawer.tsx`) — the
day-to-day flow for actually working a lead through Survey:
- Status choices exposed to the engineer are only **In Progress /
  Completed / Blocked** — `pending` is never a selectable option (a task
  that opens still `pending` is silently treated as `in_progress` in the
  form).
- Once the lead's `pipelineStage` moves past `'survey'`, the entire form
  locks into a read-only stage-status banner (a different message per
  stage — With Proposal Team / Awaiting Your Review / Awaiting Documents
  / With Backend Team (+ live step progress) / Lead Converted / Lead
  Dropped (+ reason)) — no fields, no photo uploads, no status buttons.
  If the *most recent* pipeline move was an admin override back to
  Survey, a separate "⚠️ Sent Back By Admin" banner shows the admin's
  note alongside the now-editable form.
- **Auto-behavior built into the form**: a field literally labeled
  "Survey Done Date" (any casing) auto-fills to today's date once, if
  empty. Editing "Roof Length" or "Roof Width" (matched by label, not
  fieldId) auto-computes "Total Roof Area" = length × width (rounded to
  2 decimals) into a same-named field, live, and clears it if either
  input becomes invalid/blank — this only works if an admin's Template
  page has fields with exactly those three labels.
- **Required-field validation only runs when marking a task
  Completed** — saving as In Progress or Blocked never blocks on missing
  required fields. Blocked additionally requires a non-empty blocking
  reason. Required `photo_only` fields need at least one photo; required
  `mobile` fields need exactly 10 digits; everything else just needs a
  non-empty answer.
- **GPS capture** is a one-tap "Capture Location" using the browser's
  live location watch, auto-finalizing early once a reading under 30m
  accuracy arrives, otherwise settling for whatever it has after 8
  seconds.
- **Offline-aware**: if the device is offline at submit time, any
  in-flight local (blob) photos are converted to durable base64 first,
  then the whole update is queued locally and synced automatically once
  reconnected (see `useTaskOfflineQueue`) — the engineer sees "Saved
  offline — will sync when reconnected" rather than an error.
- Closing the drawer with unsaved changes (only possible while still at
  Survey) prompts an explicit "Close without submitting?" confirm.

**Admin editing** (`onAdminUpdate`, from the Task Detail Drawer's "Edit"
button) is a **separate path** from the field engineer's submit flow —
it edits task metadata (title/description/mobile/district/lead source/
assignment/due date) inline in the detail drawer itself, at any
pipeline stage, and never touches `status`, survey answers, or the
pipeline-transition logic that `submitTaskUpdate` drives.

## Creating a task manually (`CreateTaskModal.tsx`)

Admin-only. Required: **Title**, **Consumer Mobile** (must be exactly
10 digits to submit). Optional: description, state/district (paired,
district resets if state changes), lead source (with the same
Employee-name / Field-Engineer-note sub-fields as the detail drawer's
inline editor), assigned engineer, due date (date-picker minimum is
today, not otherwise enforced in code).

Before creating, the consumer mobile is checked against every existing
task. If the duplicate check itself fails (e.g. offline), creation is
blocked entirely with an error toast — it does **not** silently allow
creating without the check. If a genuine duplicate is found, the admin
sees a confirm dialog naming the existing lead (task number, title,
created date) and can still proceed anyway — duplicates are allowed,
just explicitly warned about, never silently blocked.

The modal cannot be dismissed by clicking outside or pressing Escape —
only its own Cancel button or a successful create closes it.

## Bulk task upload (`BulkTaskModal.tsx`) — CSV format and validation

Admin-only. Expects a CSV with this **exact column order**:
```
title,description,consumerMobile,engineerCode,dueDate,state,district,leadSource,leadSourceEmployeeName,leadGeneratedByCode
```
A downloadable template (`solarops_tasks_template.csv`) with sample
rows for both lead-source types is provided in the UI.

**Per-row validation, in order** (a row fails on the first problem it
hits and is excluded from creation, but the whole file is still
previewed):
1. Title required.
2. Consumer mobile required, must resolve to exactly 10 digits after
   stripping non-digit characters.
3. `engineerCode`, if given, must match a real engineer's code.
4. `dueDate`, if given, must be `YYYY-MM-DD` and parseable.
5. If both `state` and `district` are given, district must actually
   belong to that state (per the admin-configured district list).
6. `leadGeneratedByCode` is only checked when `leadSource` is exactly
   "Field Engineer" (case-insensitive) — must match a real engineer.
7. Every row's mobile number is checked against the entire existing
   task database (in parallel) for a duplicate lead.
8. After that, every row is also checked against every **other row in
   the same file** for a repeated mobile number — flagged even if both
   individually passed step 7.

The preview table shows every row (valid rows: green checkmark; invalid
rows: red-tinted with the specific error message) with a running
valid/error count. Only valid rows are ever submitted; invalid rows are
silently skipped, never sent. Creation runs sequentially with a live
"Creating tasks… (N of M)" progress indicator, and reports succeeded
and failed counts as separate toasts once done (a per-row create
failure doesn't stop the rest of the batch).

## Survey/Documents checklist field types (`components/tasks/checklist/`)

Every form field on the Survey and Documents forms is one of 10 types,
dispatched by `ChecklistItem.tsx` purely on `field.type`:

| Type | Input behavior |
|---|---|
| `section_header` | Not a real input — renders a horizontal divider with the label as a centered caption, splitting the form into visual groups. Never counts toward required-field validation. |
| `yesno` | Three-way single-select: **Yes / No / N/A** (not just Yes/No) — stored as `'yes' \| 'no' \| 'na'`. |
| `select` | Admin-defined options rendered as tappable pill/chip buttons (single-select), not a native dropdown. |
| `text` | Plain single-line text input, no format validation. |
| `mobile` | Digits-only, capped at 10 characters, with a live "N/10 digits" counter (green once exactly 10, red otherwise). Required validation requires exactly 10 digits. |
| `number` | Native numeric input, no min/max/step constraints. |
| `date` | Native date picker, no extra validation. |
| `measurement` | Decimal numeric input (2-decimal step) with the field's configured unit shown as a fixed label alongside it (e.g. "sq ft"). |
| `age` | Two side-by-side inputs — Years (0–999) and Months (0–11) — that serialize into one string like `"5Y 3M"`. |
| `photo_only` | Renders the live `PhotoZone` capture/upload component (see below), capped at 10 photos for this field type specifically. |

A required field shows a red asterisk next to its label; the red
"missing" highlight only appears after a failed submit attempt (see
Editing/Submitting section above) — never before the user tries.

**Note:** `PhotoZonePlaceholder.tsx` also exists in this folder but is
not wired into `ChecklistItem` at all — it appears to be leftover/dead
placeholder code from before the real `PhotoZone` component existed,
not part of the live form.

## Photo & document capture/upload (`components/photos/PhotoZone.tsx`)

Tapping the capture zone opens the device's native file picker
(`accept="image/*,application/pdf"`, multi-select) — camera, gallery,
or file browser are whatever the OS presents; there's no separate
in-app camera UI. Helper text reads "Camera, Gallery or PDF".

- **Per-photo limit**: defaults to 5, overridden to 10 for `photo_only`
  checklist fields. Selecting more than the remaining slots only
  uploads as many as fit, with a toast telling the user how many were
  actually added.
- **Size limits**: images up to 10MB, PDFs up to 20MB, enforced
  per-file (oversized files are individually rejected without blocking
  the rest of the selection).
- **Image processing**: every non-PDF image is resized so neither
  dimension exceeds 1200px and re-encoded as JPEG at 80% quality before
  upload — this happens client-side, before the file ever reaches
  Cloudinary.
- **Destination**: Cloudinary, in a folder path derived from context —
  `solarops/{taskNum}/proposal` or `/documents` for those specific
  upload types, otherwise `solarops/{taskNum}/{engineerCode}_{engineerName}`
  (or `.../unassigned`), or a bare `solarops` folder if there's no task
  number yet. PDFs upload as `raw` resources and are renamed to a
  timestamped generic filename (the original filename is never sent to
  Cloudinary).
- **Upload UI**: a dimmed live thumbnail with a percentage overlay while
  in flight; one automatic retry (2-second backoff) before it's treated
  as a real failure.
- **Offline handling**: if an upload fails specifically because the
  device is offline, the photo is converted to a base64 data URL and
  kept locally instead ("Saved locally — will upload when reconnected")
  — this is what lets the offline task-update queue carry real photo
  data through to a later sync. If the same upload fails while online,
  it's just a hard failure — the user must reselect and retry, no
  automatic local fallback.
- Existing uploaded photos can be individually removed (unless the form
  is in a disabled/read-only state); an in-progress upload cannot be
  cancelled once started. Stored PDFs render as a red document tile
  that opens in a new tab; images render as thumbnails.

## Proposal team portal (`ProposalPage.tsx`)

Admins are redirected straight to `/tasks` from this page — it's
exclusively for the `proposal` role. Greeting header + 4 stat tiles:
Active (live proposal-stage count), Revisions (tasks with a nonzero
revision count), Converted, Dropped (both lifetime, from history).

**Active tab** — search (debounced Firestore query on title/task
number), an optional "↩ Needs Correction" toggle (only shown when at
least one task actually has a live `correctionReturnTo`), and task
cards showing survey engineer, survey-completed date, a color-coded
"days since survey" age indicator, and lead age. Tapping a card opens
`ProposalWorkDrawer` (see below) — this page itself has no write
actions.

**History tab** — client-side search + filter pills (All / In Pipeline
/ Converted / Dropped / Had Revision). Tapping a card opens a read-only
detail sheet: full survey reference + answers/photos, the current
proposal remark, the current proposal document, the complete revision
history (numbered by original chronological order even though listed
newest-first), the Field Review decision (if any), drop reason (if
any), and the full pipeline-history timeline.

## Backend team portal (`BackendPage.tsx`)

Admins see a static "use the Tasks page instead" message here — no
task list. For the `backend` role: greeting header + 4 stat tiles (In
Progress, Ready [journey fully complete but not yet converted], This
Month's conversions, lifetime Total conversions).

**Active tab** — split into "🎉 Ready to Convert" (journey complete)
above "In Progress", both respecting an optional correction-only
toggle. Each card shows a live journey progress bar/step count and a
color-coded "days in Backend" indicator. Tapping opens
`BackendWorkDrawer` (not read-only).

**History tab** — same read-only-detail-sheet pattern as Proposal's
history, but for Backend: survey reference, proposal document, the
full Application Journey (every step, done-dates, photos, remarks),
a Converted banner if applicable, drop reason, pipeline-history
timeline, and — only for old pre-Application-Journey tasks with no
`applicationJourneySteps` at all — a legacy "Backend Checklist Answers"
fallback section.

## Backend Manager view (`BackendManagerPage.tsx`) — confirmed genuinely read-only

Read directly from the code (not assumed): this page has **zero write
capability**. It loads every active Backend-stage task **org-wide**
(explicitly unscoped to any one engineer — a manager sees all of it),
offers only search and "Load More" pagination, and opens
`BackendWorkDrawer` with `isReadOnly` **explicitly passed as `true`**.
Inside that drawer, every control that would normally write data
(payment-type selection, step yes/no buttons, photo upload, step date
input, per-step remarks, backend remark editing, "Mark Step Complete",
"Mark as Converted") is switched off and replaced with plain static
text. No mutation hook (`usePipelineActions`, `updateDoc`, etc.) is
even imported in the page file itself. The page header states this
directly: "Read-only view of all active backend tasks."

## Stage work drawers — fields, validation, and what each button actually does

**`ProposalWorkDrawer`** (Proposal → Field Review): upload one or more
PDFs (non-PDF files and files over 20MB are individually rejected with
a toast, never silently dropped without explanation) plus an optional
note to the field engineer. At least one file is required to enable
"Submit Proposal →". All files upload in parallel; if **any single
upload fails, nothing is submitted** — there is no partial-submission
path. Also carries an editable internal-only "Proposal Remark" and
shows the full survey reference + prior revision history for context.

**`BackendWorkDrawer`** (Backend → Completed): first requires a
one-time Cash/Loan payment-type choice (confirmed via an explicit
"cannot be changed without admin access" warning) which loads the
admin-configured step list for that type. Each Application Journey step
requires, depending on type: for `yesno` steps, an actual **"Yes"**
answer to advance (a "No" can only be saved as a draft, never
completes the step); for `photo` steps, at least one photo; every step
also requires a date. Steps have their own optional persisted remarks.
Once every step is done, "✅ Mark as Converted" appears (with a
`window.confirm` — "cannot be undone") and calls `markLeadConverted`.
Closing the drawer mid-step with an unsaved "No" answer silently saves
it as a draft first rather than discarding it.

**`DocumentsWorkDrawer`** (Documents → Backend): renders the **live**
`documentTemplate` from Template config, not a frozen snapshot taken at
an earlier stage — an admin editing the Documents form after a task
already reached this stage will change what that task sees. Required
fields (photo or otherwise) must all be answered before either action
button enables. Offers two distinct actions: **"Save Progress"** (persists
without moving the pipeline stage — for engineers filling this out
across multiple sessions) and **"Submit Documents →"** (persists then
actually advances to Backend). Both share the same auto-recompute of
Sales Closed evidence on every save, always skipped if the task's
`saleClosedSource` is already `'manual'`. Any photo upload that silently
falls back to a local `data:` URL (the underlying `PhotoZone`'s offline
failure path) is treated as a hard save failure here specifically —
this drawer is online-only and refuses to persist a fallback URL.

**`FieldReviewDrawer`** (Field Review → Documents/Backend/Proposal/Dropped):
three decision buttons — Accept (label dynamically says "→ Documents"
or "→ Backend" depending on whether any document-template fields are
configured), Request Revision (requires a non-empty "What needs to
change?" note to confirm), Reject (optional reason). Confirming calls
`submitFieldReviewDecision`; an "accepted → documents" result can chain
directly into opening `DocumentsWorkDrawer` if the caller wired that up,
skipping an extra manual re-open.

**Shared pattern across all four drawers**: every one shows the same
amber "sent back by admin" banner whenever the task's most recent
`stageHistory` entry is an `admin_override` landing on that drawer's own
stage — reusing the exact detection idea `needsResurvey.ts` formalizes
for Survey specifically (see `PIPELINE_FLOW.md`), just inlined per-drawer
here rather than centralized.

## Engineer Detail Drawer & User Card — what the numbers actually mean

**`EngineerDetailDrawer`** (opened from the Team page) shows a live
count of that engineer's own assigned tasks (query scoped by role:
`assignedTo`/`proposalAssignedTo`/`backendAssignedTo` as appropriate,
always `archived === false`), a "Completed/Done/Converted" count whose
definition **changes by role**, and a resulting completion percentage.
Tapping a listed task fetches the **full** task document fresh (not the
lightweight stats-query shape) and opens a nested `TaskDetailDrawer`
with admin-editing explicitly disabled from this entry point.

**`UserCard`** shows the same per-role stat line (reusing the identical
counting rules) plus presence (online dot + "last seen"), role badge,
engineer code, district (field only), and a disabled/crown/push-icon
indicator set. Its action buttons (View/Edit/Change Role/Disable) are
all purely prop-driven — the card itself performs no writes; "Change
Role" specifically uses a `window.prompt` numbered-list picker and an
extra-strength confirmation when promoting someone to admin.

**⚠️ Flag — the "done"/"completed" metric is not the same thing across
roles**, worth knowing before trusting these numbers at a glance:
- **Backend**: strictly `pipelineStage === 'completed'` (a real
  conversion).
- **Proposal**: `pipelineStage !== 'proposal'` — i.e. **any** task that
  has left the Proposal stage for **any** reason at all, including a
  later drop. A Proposal engineer's "done" count is not "leads I
  successfully converted," it's "leads I finished my part of, good or
  bad."
- **Field / other roles**: `status === 'completed'` — this is the
  Survey-submission flag (see `SCHEMA.md`'s `status` vs `pipelineStage`
  distinction), not a pipeline-stage or conversion measure at all.

## PipelineTracker — FIXED 7 Aug 2026 (this entry was stale, corrected 12 Aug 2026)

This entry previously described a live bug — it no longer is one.
`PipelineTracker.tsx` was fixed in commit `0916375` (7 Aug 2026): it
now imports `stageIndex`/`isBackwardMove` from the new shared
`src/utils/stageOrder.ts` and derives a dropped task's true origin
from the last `stageHistory` entry, instead of hardcoding
`field_review`. Confirmed via direct code read, 12 Aug 2026.

## Cross-check finding: `BackendStageData`'s legacy fields appear unused in the current write path

`SCHEMA.md` documents `BackendStageData` as having `subsidyApplied`,
`subsidyStatus`, `portalRegDate`, `sanctionLetterUrl`, `notes`. Across
every file read this session (`BackendWorkDrawer`, `markLeadConverted`
in `PIPELINE_FLOW.md`), the only fields ever written to the
`stages/backend` sub-document are `applicationJourneySteps`,
`paymentType`, `completedAt`, `completedByUid`, `completedByName` — none
of `BackendStageData`'s other fields are populated anywhere found so
far. `BackendHistoryDetailContent`'s "legacy Backend Checklist Answers"
fallback (rendered only when a task has no `applicationJourneySteps` at
all) suggests these fields belonged to an older, since-replaced backend
workflow. Not a contradiction to fix silently — just flagging that this
part of the documented schema may be dead/legacy rather than live.

## Team page (`TeamPage.tsx`) — user management

**No delete action exists anywhere** — an admin can only ever Disable
an account, never remove it. "Inviting" a user is really: admin fills
in a Create User form (name, email, role, state/district if Field
Engineer, optional mobile), the app creates the Firebase Auth account
itself via a **secondary** Auth app instance (so the admin's own
session is never disturbed), assigns a role-based sequential code
(`ENG-001`/`PROP-001`/`BACK-001`/etc. via a collision-safe transaction),
and sends the brand-new user Firebase's own standard **password-reset
email** — there's no custom invite link or app-tracked expiry; whatever
Firebase Auth's own reset-link lifetime is (its default) is what
governs it.

**Editable per-user, from the card:** Enable/Disable (confirm dialog),
Change Role (confirm dialog, explicitly warns access changes
immediately) — both blocked for your own account and for the
`superAdminUid` account, and role-change additionally refuses to demote
the last remaining admin. Edit (name, mobile, state/district for field
role — email and role are NOT editable from this form, only from the
separate role-change control) cascades: renaming a user re-syncs their
denormalized name onto every task/assignment slot that stores it, and
changing mobile similarly re-syncs `assignedToMobile` onto their tasks.

**Filters/search/tabs:** search by name/email, State/District filters
(field-role scoped), 8 tabs with live counts (All, Admins, Field,
Proposal, Backend, View Only, Backend Managers, Disabled), an "Export
CSV" of the currently-filtered list (Name/Engineer Code/Email/Role/Status).
Clicking a card (not the action buttons) opens `EngineerDetailDrawer`.

## Template editor (`TemplatePage.tsx`) — the full admin configuration surface

Three tabs plus several always-visible sections below them.

**Survey form builder** (backed by `taskTemplate`): fields are added
(dashed "Add Field" button, defaults to a required Yes/No field),
reordered (per-field up/down chevrons), edited inline (label, type,
required toggle, type-specific extras), and deleted (with an inline
Yes/No confirm — no accidental single-click delete). **10 field types**
are configurable: Yes/No, Text, Mobile Number, Number, Select (with an
options list editor — add/remove options, exact-string dedup), Photo
only, Date, Measurement (+ a free-text unit label like "sq.mtr"), Age
(years+months), and Section Header (a pure visual divider, reuses the
`unit` field internally to store an optional subtitle). A banner warns
admins: saving the Survey template updates **every active task**
(pending/in-progress/blocked) immediately — completed tasks are never
touched.

**Documents form builder** (backed by `documentTemplate`): reuses the
**exact same field-editor component** as Survey (same 10 types, same
options/unit/section-header handling), but is a **fully separate field
list and separate save action** — editing one never touches the other.
Its save banner explicitly says the opposite of Survey's: saving does
**not** retroactively modify tasks already in progress.

**Application Journey step editor** (backed by `backendCashSteps` /
`backendLoanSteps`): **two completely independent step lists**, one for
Cash payment and one for Loan payment, switched via a sub-tab. A step
has a label (editable), an order, and a type — but **the type itself
(Yes/No vs Photo) is not editable in this UI**, only its label and
position; adding a new step always defaults to Yes/No. Deleting a step
is immediate, no confirmation. The seeded defaults are 16 Cash steps
and 18 Loan steps (Loan has two extra steps for loan-portal
application/sanction) covering the whole backend workflow from Sales
Order Creation through final subsidy disbursement.

**Sales Closed mapping panel**: 6 dropdowns total — Payment
Type/Amount/Image for Survey, and the same three for Documents — each
populated from that specific form's own field list (section headers
excluded). If a previously-saved mapping points at a field that's since
been deleted from the form, an explicit amber warning appears: "⚠
Previously selected field no longer exists — please re-select" (this
is a real, working safeguard, not just theoretical).

**States & Districts management**: per-state cards (removable, with a
cascade-warning confirm if it still has districts under it) each
listing removable district chips, plus add-district and add-new-state
inputs. Names are auto-title-cased and silently deduped
(case-insensitive). An empty state directs the admin to the "Migrate
Existing Districts to Maharashtra" tool below.

**Lead Sources management**: a flat, simpler chip list (add/remove,
same title-case + dedup rules) — no per-state structure.

**⚠️ "Backend Checklist Template" does not actually exist as an editable
feature.** `AppConfig.backendChecklistTemplate` is seeded as an empty
array by `initAppConfig()`, but nothing in `TemplatePage.tsx` reads or
writes it — it's vestigial, entirely superseded by the Cash/Loan
Application Journey step lists. Same category of finding as the
`BackendStageData` legacy-fields note above.

### Admin Tools — every button actually wired up in the UI, and what
it really calls

**Reduced from 7 buttons to 3, 12 Aug 2026** (full investigation in
`TRACKER.md`'s "Admin Tools button audit" entry) — the 4 removed
buttons are listed below for historical reference, followed by the
3 that remain and are confirmed still genuinely needed:

**Remaining 3:**
1. **🔧 Recalculate Pipeline Counts** — recomputes every stage count
   client-side, shows the admin a diff in a confirm dialog before
   writing anything. Confirmed real ongoing purpose: catches pure
   numeric drift that the automatic `reconcilePipelineCounts()`
   fallback only catches for structural corruption (missing/
   negative/incomplete keys), never for plain wrong-but-complete
   values. **Confirmed drift-risk, not just suspected:** this does
   NOT call `backfillPipelineCounts()` from `initAppConfig.ts` — it
   duplicates that same logic inline in the page itself, so the two
   implementations could drift apart over time.
2. **🔧 Backfill Sales Closed** → `reconcileSaleClosed()` — recomputes
   Sales Closed for every non-manually-set task. Genuinely ongoing,
   not one-time: needed every time the admin changes the Sales
   Closed field-mapping panel.
3. **📊 Recalculate Engineer & District Counts** → `backfillEngineerDistrictCounts()`
   — full rebuild of the `engineerCounts`/`districtCounts` maps.
   The ONLY safety net that exists for drift in these hand-
   maintained counters — no automatic equivalent anywhere.

**Removed 12 Aug 2026, both confirmed via direct code read:**
- **🔍 Check Status/Stage Corruption** and **🔧 Repair Status/Stage
  Corruption** — temporary diagnostic buttons, removed after
  production's real corrupted-task count (19) was found and repaired.
- **🗺️ Migrate Existing Districts to Maharashtra** — confirmed a
  one-time single-state→multi-state schema migration, job done, no
  legitimate future need (all new records get `state` set at
  creation already).
- **↩ Migrate Historical Reverted Tasks** — confirmed dangerous: a
  deliberate Full Restart done with a custom note is indistinguishable
  from an accidental revert to this function, and would get wrongly
  tagged with correction tracking. Its legitimate matching set (tasks
  corrupted before correction-tracking existed) was always historical
  and fixed in size — near-zero remaining legitimate use now that the
  root corruption bug is fixed.

**⚠️ Flag — most of `initAppConfig.ts`'s functions have no admin-tools
button at all.** Confirmed by reading the whole file: `initAppConfig`,
`migratePipelineStages`, `syncUserTaskCodes`, `backfillPipelineAssignments`,
`initBackendJourneySteps`, `backfillJourneyCompleted`,
`migrateLogisticsToBackend`, `backfillTitleLower`, `backfillMemberCounts`,
`initMemberInCounts`, `reconcilePipelineCounts`, `backfillCreatedBy`, and
`ensureSuperAdmin` are all real, exported functions with zero UI entry
point in `TemplatePage.tsx`. **Confirmed since this was first flagged:**
`DashboardPage.tsx` runs 10 of these automatically on every admin page
load (see this file's own Dashboard section below) — only
`backfillTitleLower` remains a genuine unaccounted-for orphan.

## Reports page (`ReportsPage.tsx`)

**Charts, all all-time snapshots — there is no date-range filter
anywhere on this page:** a Tasks-by-Status donut (live exact counts via
`getCountFromServer`), a Completion-Rate-by-Engineer bar chart and a
Pipeline-Stage-Distribution bar chart (both from the denormalized
`engineerCounts`/`pipelineCounts` aggregates, not live per-task
queries), a Tasks-by-District and a Conversion-Rate-by-District list
(top 15, from `districtCounts`), a Pipeline Funnel (Total → Survey Done
→ Proposal → Field Review → Documents → Backend → Converted, plus
Conversion Rate/Drop Rate summary tiles), and a Recent Submissions table
(most recent 20, drawn from a larger fetched batch).

**Two CSV exports** — "Export Pipeline CSV" (Task #, Title, Engineer,
Pipeline Stage, Payment Type, Journey Steps Done/Total, Proposal Team,
Backend Team, Dropped Reason, Conversion Date, Survey Date, Created
Date) and "Export Submissions CSV" (Task #, Title, Assigned To, Status,
full Submitted-At timestamp) — both filename-dated.

**Hard caps, confirmed and precisely characterized (this project has a
known pattern of unpaginated/capped admin queries — see `PARKED.md`):**
- The full task fetch behind the Pipeline export and several charts is
  capped at **5,000** non-archived tasks. If a cap-triggering result
  comes back, clicking **Export Pipeline CSV** shows an error toast
  ("more than 5,000 tasks exist... contact admin") — but still performs
  the incomplete export anyway. **This truncation is not shown anywhere
  proactively in the chart UI itself** — only at the moment of export.
- The submissions fetch is capped at **500**. This one has a real UI
  indicator beyond the export-time toast: the "Recent Submissions"
  section header appends a `+` to its count (e.g. "(500+)") whenever
  truncated.
- The status-count, engineer, pipeline-stage, and district/funnel
  sections are **not** subject to either cap — they're driven by exact
  `getCountFromServer` calls or the denormalized aggregate counters, not
  by a capped document fetch.

## Login & signup — and a genuine, confirmed second account-creation path

**Login (`LoginPage.tsx`)**: email + password, "Forgot password?" sends
a Firebase reset email — deliberately shows the same generic success
message whether or not that email actually exists on an account
(an email-enumeration-safe pattern, not a bug). Post-login redirect is
role-based: `proposal`→`/proposal`, `backend`→`/backend`,
`backend_manager`→`/backend-manager`, everything else→`/dashboard`.

**⚠️ Flag — there are TWO separate, structurally independent ways a
new user account gets created, not one.** Earlier in this doc,
`TeamPage.tsx`'s "Create User" flow was described (admin fills a form →
secondary Auth app instance creates the account → a standard Firebase
password-reset email is sent as the "invite"). Reading `SignupPage.tsx`
and `useInviteActions.ts` fresh reveals a **second, entirely different**
system that also genuinely exists in the code:
- `useInviteActions.createInvite(name, email, role)` writes a real
  `invites/{inviteId}` Firestore doc (`status: 'pending'`, a 7-day
  `expiresAt`) — this is the `Invite` type `SCHEMA.md` already
  documents, confirmed actually implemented, not just a type definition.
- `SignupPage.tsx` (route `/signup/:inviteId`) loads that invite doc,
  validates it's not expired/already-used, lets the invited person set
  their **own** password directly (no admin-generated temp password, no
  reset email involved at all), creates their Firebase Auth account
  directly on the **primary** app instance (so it also signs them in
  immediately), writes their `users/{uid}` doc with `createdBy` set to
  the **invite ID** (not an admin uid), and marks the invite
  `'accepted'`.
- `revokeInvite(inviteId)` exists to cancel a pending invite.
- **RESOLVED 13 Aug 2026, via a dedicated 4-part read-only audit:**
  this invite-link path is confirmed genuinely unreachable through
  normal use. `createInvite` (the only thing that would ever produce
  a real, usable invite ID) has zero callers anywhere in `src/` — not
  a button, not a page, nothing. The `/signup/:inviteId` route exists
  and is registered, but since nothing ever creates a real invite to
  link to, no real user could ever legitimately land there. The
  "Create User" flow described above is genuinely the only real
  account-creation path in active use.

**`useAuth.ts`** populates the global `AppUser` (via `useAuthStore`) on
every auth-state change: force-refreshes the ID token, prefers a `role`
custom claim if present, otherwise falls back to the Firestore
`users/{uid}.role` field. **Worth noting**: since this project has zero
Cloud Functions (confirmed in `ARCHITECTURE.md`), nothing anywhere
actually *sets* a custom claim — so in practice this fallback chain
always resolves to the Firestore field; the claims-preferring code path
exists but is currently unreachable dead weight, not a live alternate
source of truth. Also guards two real failure modes: a brand-new
signup's Firestore doc not existing yet (retries once after 1s, then
signs out with "Account setup incomplete"), and a disabled account
(`active === false`, forces sign-out with "Account disabled").

## Presence / online status — confirmed end-to-end (see also `SCHEMA.md`'s Realtime Database section)

`usePresence.ts` writes only to the current user's own
`presence/{uid}` Realtime-Database node (`online`, `lastSeen`, `name`,
`role`), backed by an `onDisconnect` handler for ungraceful
disconnects. `useOnlineUsers.ts` (admin/view_only only) subscribes to
the whole `presence` tree and derives the Dashboard's "N users online"
count purely from each entry's `online` boolean — there is no
staleness timeout, so a connection that dies without triggering
`onDisconnect` could show as online until it reconnects. The Realtime
Database security rule itself does not scope writes per-uid at all
(`auth != null` only) — the one-user-writes-only-their-own-node
behavior is enforced by app-code convention, not by the backend. Full
detail now lives in `SCHEMA.md` rather than repeated here.

## Offline handling — network detection, the IndexedDB queue, and how it actually retries

`useNetworkStatus.ts` is a thin wrapper around the browser's native
`window` `online`/`offline` events (`navigator.onLine` for the initial
value) — no active ping/probe, purely reactive to what the browser
reports. `OfflineBanner.tsx` is a thin presentational component: amber
"You're offline — updates will sync when connection is restored" (+
pending count) while offline, or a blue "Syncing N offline update(s)…"
banner while online with a non-empty queue.

**The queue itself** (`useTaskOfflineQueue.ts`) is a small `idb`-backed
IndexedDB store (`solarops-offline` DB, single `queue` object store,
auto-incrementing `id`), exposing plain standalone functions
(`enqueueTaskUpdate`, `dequeueTaskUpdate`, `updateQueueItem`,
`getAllQueued`, `getQueueCount`) that any code can call directly — the
hook itself is just a reactive count for UI badges, refreshed via a
custom `window` event every write function dispatches.

**`TaskQueueProcessor.tsx`** (background-only, renders nothing) is what
actually drains the queue:
- Fires 2 seconds after the browser goes from offline→online (a
  debounce to let the connection stabilize), guarded by a mutex ref so
  it never runs two passes concurrently.
- **Retry limit is 5 attempts.** Any item that already has
  `attempts >= 5` is logged and **silently dropped from the queue with
  no per-item user notification** — the user only ever sees the
  aggregate "X synced, Y failed" toast for the current pass, not a
  record of previously-abandoned items.
- Processes strictly one item at a time, in insertion order; a single
  item's failure increments its `attempts`/`lastError` and moves on to
  the next item rather than aborting the whole batch.
- Each item does substantially more than a single Firestore write:
  re-uploads any still-base64 field photos to Cloudinary — **fixed
  13 Aug 2026: a photo-upload failure now throws and is retried by the
  existing 5-attempt mechanism, instead of silently saving raw base64
  data as a fallback (the old behavior this line used to describe)** —
  enforces the same 10MB/20MB image/PDF size caps used
  elsewhere on completion photos (oversized ones are dropped with a
  toast), recomputes Sales Closed evidence (never overwriting a manual
  override — same rule as everywhere else), writes the main task
  update, writes the submission-history record exactly once even
  across multiple retry attempts (tracked via a `historyWritten` flag),
  and — only if the queued status was `'completed'` — runs the full
  survey→proposal pipeline transition in its own transaction, wrapped
  separately so a transition failure never undoes the main data save
  that already succeeded.

## Thin/wrapper hooks — briefly, since there's nothing more to say

- **`useUsers.ts`** — a live `onSnapshot` over the whole `users`
  collection (deliberately no `orderBy`/`where`, so manually-created
  admin docs without a `createdAt` aren't excluded, and no index is
  required), sorted client-side, feeding the `userStore`. Slightly more
  than a bare wrapper (does real field-defaulting and client-side
  sorting) but no business logic beyond that.
- **`useFieldEngineers.ts`** — genuinely thin: a pure `useMemo` filter
  (`role==='field' && active && !deletedAt`) over whatever `useUsers.ts`
  already put in the store. No Firestore access of its own.
- **`useBulkTaskActions.ts`** — confirmed exactly as suspected earlier
  in this document: a thin sequential loop (capped at 500 rows) calling
  the same `createTask` from `useTaskActions()` once per row, tallying
  succeeded/failed counts. No bulk-specific validation or Firestore
  logic of its own — all the real CSV validation lives in
  `BulkTaskModal.tsx`, already documented above.
- **`checkDuplicateMobile.ts`** — one function, `checkDuplicateConsumerMobile(mobile, excludeTaskId?)`:
  a plain Firestore query for a non-archived task with a matching
  `consumerMobile`, excluding the task being edited (if any). Used
  identically by `CreateTaskModal`, `BulkTaskModal`, and the Task Detail
  Drawer's inline mobile editor, all already documented above.
- **`engineerStats.ts`** — one function, `getProposalDoneCount(tasks)`:
  `tasks.filter(t => t.pipelineStage && t.pipelineStage !== 'proposal').length`
  — this is the exact "done ≠ converted" Proposal metric already flagged
  above under Engineer Detail Drawer/UserCard.
- **`proposalDocuments.ts`** — one function, `getProposalDocuments(data)`:
  normalizes a `stages/proposal` doc into a single `{url,name}[]` shape
  regardless of whether it's old-shape (`documentUrl`/`documentName`
  singular fields) or new-shape (`documents` array) — this is what lets
  every proposal-document display spot in the app (drawers, history
  sheets) handle both legacy and current data the same way.
- **`proposalNoteLabel.ts`** — one function,
  `getProposalNoteRecipientLabel(submittedToStage)`: maps a proposal's
  `submittedToStage` to a human label for who the attached note is
  for — "Note for Backend Team" only when `submittedToStage ===
  'backend'`; "Note for Field Engineer" for `field_review`/`documents`/
  `survey`/undefined; a generic fallback otherwise. Purely a display
  label, no logic beyond the mapping.
- **`districtUtils.ts`** — `toTitleCase` (simple word-capitalizer, used
  everywhere district/state/lead-source names are entered) and
  `resolveDistrictCasing` (case-insensitive match against an existing
  list, else title-cases the input — this is what prevents "mumbai" and
  "Mumbai" from becoming two different districts). The third function,
  `resolveAndAutoAddStateDistrict(db, state, district)`, is the real
  logic behind "new tasks silently grow the district list": it resolves
  correct casing for both state and district, then fire-and-forget
  (`.catch(console.error)`, not awaited by the caller) adds any genuinely
  new state/district to `appConfig.districtsByState` **and** keeps the
  legacy flat `appConfig.districts` array in sync at the same time —
  called from `CreateTaskModal`'s task-creation flow (and presumably
  `useBulkTaskActions`/`useTaskActions.createTask`, per earlier session
  notes) before the task itself is written.
- **`uploadToCloudinary.ts`** — confirms every behavior already
  documented under Photo & document capture/upload, at the exact
  implementation level: `uploadWithRetry` does exactly one retry (2
  attempts total) with a 2-second delay, each attempt has a 60-second
  XHR timeout, and the folder-path logic (`proposal`/`documents`
  upload-type overrides, else `{engineerCode}_{engineerName}` or
  `unassigned`, else a bare `solarops` folder with no task number) and
  image compression (10MB pre-check, 1200px max dimension, JPEG @ 0.8
  quality) match what `PhotoZone.tsx` was already found to rely on —
  no new behavior found, just confirmation at the lower level.

## Dashboard & Tasks page — genuinely new findings from a clean linear re-read

Everything below is new — it was not already captured anywhere in this
file, `TRACKER.md`, or `PIPELINE_FLOW.md`. Everything else in both
files matched prior descriptions exactly and isn't repeated here.

**⚠️ Major finding — resolves the earlier "does anything actually call
these?" uncertainty about `initAppConfig.ts`'s unexposed functions.**
`DashboardPage.tsx` runs a real boot-time migration/backfill sequence
in a `useEffect` gated on `currentUser?.role === 'admin'`, on **every
admin page load**:
```
initAppConfig()                    — always
ensureSuperAdmin(uid)              — always
reconcilePipelineCounts()          — always ("lightweight check", per its own code comment)
syncUserTaskCodes()                — once per browser, gated by localStorage 'so_task_code_sync_v1'
migratePipelineStages()            — once per browser, 'so_pipeline_migrate_v1'
backfillPipelineAssignments()      — once per browser, 'so_backfill_assign_v1'
initBackendJourneySteps()          — once per browser, 'so_backend_journey_v1'
backfillJourneyCompleted()         — once per browser, 'so_journey_complete_v1'
migrateLogisticsToBackend()        — once per browser, 'so_migrate_logistics_v1'
backfillMemberCounts()             — once per browser, 'so_member_counts_v1'
backfillCreatedBy(uid)             — once per browser, 'so_created_by_v1'
```
This confirms 10 of the previously-unaccounted-for `initAppConfig.ts`
functions really do run, automatically, with no admin ever clicking
anything. **But the "once" gating is a real, previously-unknown
caveat**: each is gated by a `localStorage` flag, checked and set in
the *browser*, not by any server-side "already done" marker. That means
every one of these re-runs in full the first time an admin logs in from
a **new browser or device** — not truly "run once, ever," but "run once
per browser." For read-only reconciliation functions this is harmless
overhead; for the ones that do real writes it means a fresh device
login could re-trigger a batch scan/write across the whole `tasks`
collection. `backfillTitleLower` and `initMemberInCounts` remain the
only two of the originally-flagged ~13 functions still unaccounted for
by any confirmed trigger (`initMemberInCounts` is separately confirmed
called from `useUserActions.createUser`, so really only
`backfillTitleLower` is still a genuine mystery/orphan).

**Per-role Dashboard views not previously documented** (the earlier
Dashboard write-up only covered the admin/view_only view):
- **Proposal role**: greeting header, 2 stat tiles (Active = live
  proposal-stage count, Revisions = tasks with a nonzero revision
  count), and a single purple card linking to `/proposal`.
- **Backend role**: greeting header, 2 stat tiles (Active, Ready =
  journey fully complete), and an orange card linking to `/backend`.
- **Backend Manager role**: greeting header only, no stats at all — a
  single card linking to `/backend-manager`.
- **Field engineer role**: "My Tasks" stat row (Total/Pending/In
  Progress/Awaiting Review — the last one counts tasks currently at
  `pipelineStage === 'field_review'`), an "Active Tasks" list (top 5
  pending/in-progress tasks, in-progress sorted first then newest-created),
  their own "Today's Follow-ups" list, and a "Next Due" card (nearest
  upcoming due date among their own still-in-survey, non-completed
  tasks — ties/overdue handled by a custom comparator that puts future
  dates first in ascending order, then past-due dates in descending
  order).

**Admin-view widgets not previously documented:**
- **"Unassigned leads alert"** — a red banner (only shown when the
  count is nonzero) summing `unassigned_proposal + unassigned_backend`
  from the denormalized counters, linking to the Tasks page pre-filtered
  to `unassigned`.
- **"Today's Follow-ups"** (admin version) — org-wide, shows every
  task with an active follow-up due today (still at Survey, not yet
  completed), each row showing the assigned engineer's name, linking
  individually to that task's detail view and collectively to the
  `follow_up` Tasks-page tab.
- **"Pipeline Activity Today"** — a genuinely separate live feed from
  "Recent Activity": a direct Firestore query for any non-archived task
  `updatedAt` today, then flattens each matching task's `stageHistory`
  down to just today's entries, sorted newest-first, capped at 20,
  showing task title/number, actor name, `fromStage → toStage`, and
  time (Asia/Kolkata). This is a distinct widget from the "Recent
  Activity" survey-submission feed already documented — one tracks
  survey submissions, the other tracks pipeline-stage transitions.

**Tasks-page filter-bar mechanics not previously documented** (admin/
view_only only): State, Engineer, District, and Lead Source dropdown
filters (via a shared `SearchableSelect` component) plus separate
Created-Date and Due-Date quick-filters (Today/Yesterday or Today/
Tomorrow buttons, plus a raw date picker for either). **Engineer/
District filters and the Created/Due-Date filters are mutually
exclusive by design** — picking any date filter clears and disables
Engineer/District (and resets the active tab to "All"), and vice versa;
an inline italic hint explains this ("Clear other filters to use
Created Date filter") whenever the disabled state is showing.

**Tasks-page's own Excel export has a different, separate cap from
Reports' CSV exports** (already documented under Reports page):
`fetchAllTasksForExport` drains up to **20,000** matching tasks (in
500-doc batches, cursor-paginated) — not the 5,000/500 caps that apply
to `ReportsPage.tsx`'s separate CSV exports. If the 20,000 cap is hit,
the same style of toast fires: "Export may be incomplete — over 20,000
matching records found. Narrow your filters." Distinct from Reports'
export caps — don't conflate the two when reasoning about data-volume
limits.

**Deep-link mechanism, confirmed**: `TasksPage.tsx` reads
`location.state` for either `{ filter }` (sets the active tab directly
— what every Dashboard card's `navigate('/tasks', { state: { filter }
})` click relies on) or `{ openTaskId }` (opens that task's detail/update
drawer directly, retrying once after tasks finish loading if the task
isn't found in the store yet, and showing an explicit "Task not found.
It may have been archived." toast if it's still missing after that).
