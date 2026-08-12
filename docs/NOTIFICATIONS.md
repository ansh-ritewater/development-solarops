# SolarOps — Notifications: Research & Design Reference

**Status: RESEARCH ONLY. Nothing in this document has been built.**
**Last updated: 7 August 2026**
This file exists purely so a future session (or a future you) doesn't
have to re-derive this thinking from scratch. Nothing here is a
commitment to build any of it, in any order, on any timeline.

## The core distinction: two genuinely different features

**In-app notifications** — a bell icon + list of events, visible only
while the app is open. Cheap, low-risk, fits the app's existing
patterns exactly (same idea as the `errorLogs` collection already
built this session).

**Push notifications** — reach a phone/browser even when the app is
completely closed, like a WhatsApp message. Fundamentally different
in cost and complexity, explained fully below.

**Ansh's stated goal: both, eventually.** Field engineers are the
first-priority audience (new assignments, correction/re-survey alerts).

## Why push notifications are a bigger step for THIS app specifically

Confirmed via full codebase audit (see `docs/ARCHITECTURE.md`,
`docs/SCALABILITY.md`): **SolarOps currently has zero server-side code
of any kind** — no Cloud Functions, nothing. Every existing "automatic"
behavior (counter maintenance, backfills, reconciliation) runs
client-side, in someone's browser.

A closed phone can't check Firestore on its own — something has to be
actively watching for the event and pushing it out. That means real
push notifications would be **this app's first-ever backend
component.** Not expensive or exotic (a small Cloud Function, on the
Blaze plan you already have active on production), but a genuine
architectural first for this specific codebase, not "just add a
feature" the way most of this session's work has been.

## The correct, safe credential model (verified against real Firebase
documentation via external research, cross-checked here)

Two different "keys" exist, and they must not be confused:

- **VAPID public key** — generated in Firebase Console (Project
  Settings → Cloud Messaging → Web Push certificates). Safe to put
  directly in frontend code. This is what the React PWA uses to
  register a browser for push.
- **Service account credentials** — must NEVER be manually downloaded
  or committed anywhere. A deployed Cloud Function gets secure,
  Google-managed credentials automatically via
  `admin.initializeApp()` — no private JSON key needs to touch this
  repo at all. This matches the "never extract or commit credentials"
  discipline already followed all session for Firebase/gcloud access.

## The correct architecture pattern (cross-checked, this part of the
outside research is accurate and worth keeping)
```

Real SolarOps event happens (e.g. a lead gets assigned, or Full
Restarted to Survey)
│
▼
Firestore document changes (already happens today, for every one
of these events — this app already writes rich data on every action)
│
▼
[NEW] Cloud Function detects the change, decides who should be told
│
▼
Writes an in-app notification record (cheap, no new infra)
│ AND, separately —
▼
Calls Firebase Cloud Messaging → real push to that person's device

```

**Important, SolarOps-specific point:** build this as ONE centralized
notification service that every part of the app can call into —
not scattered "send a notification" code copy-pasted into ten
different functions. This session already hit the exact cost of the
opposite approach once (the Sales Closed mapper-gap bug needed the
identical fix applied separately in 4 different files, because there's
no single shared data-access layer — see `docs/KNOWN_ISSUES.md`). Don't
repeat that mistake for a brand-new feature.

## The real SolarOps events worth notifying on (NOT generic CRM
examples — mapped to this app's actual, confirmed pipeline)

- A lead assigned to a field engineer, a proposal team member, or a
  backend team member
- **Quick Correction** sent back to someone (already has a full
  tracking mechanism — `correctionReturnTo` — built this session)
- **Full Restart to Survey** — the exact `needsResurvey` feature built
  this session; the field engineer currently has to notice this
  themselves by checking their task list
- **Sales Closed** detected (auto or manual)
- A lead **dropped**
- A Backend Application Journey step completed
- (Admin-side, ties directly to the already-parked "real external
  monitoring/alerting" item in `docs/PARKED.md`) — a real application
  error occurring, currently only visible by manually opening
  `/error-logs`

**Explicitly NOT applicable to this app** (from the outside research,
correctly excluded): "Proposal Approved," "Documents Approved" — this
app doesn't have those exact steps; the real equivalent is Field
Review's accept/reject/revision decision.

## Scheduled/time-based reminders — a genuinely different mechanism

Things like "you have 4 pending tasks today" or "this lead is overdue"
aren't triggered by an event — they're triggered by *time passing*,
with nobody taking an action. This needs a scheduled job (e.g. Cloud
Scheduler calling a Cloud Function on a timer), which is a different
piece from the event-triggered push above, not automatically covered
by building that first.

## Real constraints specific to SolarOps, that generic research misses

- **iOS/Safari limitation:** web push for a PWA on iPhone only works
  if the person has actually added the app to their home screen — not
  just visiting it in a browser tab — and only on modern iOS. Confirm
  what devices the field team actually carries before this becomes a
  load-bearing design assumption.
- **Dev is on the free Spark plan; production (`solarops-ritesolar`)
  is on the paid Blaze plan** (confirmed by Ansh, 7 Aug 2026). **Cloud
  Functions require Blaze to even deploy.** This breaks the dev-first
  workflow this entire session has otherwise followed — dev would need
  upgrading to Blaze before a Cloud Function could be built or tested
  there at all. Cost impact at this app's real scale would likely be
  small, but this is a real decision point, not a detail.
- **PWA/service worker infrastructure already exists** (`vite-plugin-pwa`,
  confirmed in `vite.config.ts` and `docs/ARCHITECTURE.md`) — this is
  the foundation push notifications would build on top of; it does not
  need to be built from scratch.
- **Not a fully clean slate — corrected 12 Aug 2026.** There is
  dormant, unused scaffolding: `User.fcmToken`/`fcmTokenUpdatedAt` in
  `types/index.ts`, `useUserActions.ts` writing both as `null` at
  user creation, `useUsers.ts` mapping them back on read, and
  `UserCard.tsx` rendering a small indicator when `user.fcmToken` is
  truthy. Nothing anywhere requests a token or sends a push — it's
  leftover scaffolding from something started once and abandoned,
  not active push code. Still effectively a clean slate for the real
  implementation work, just not a literally blank one.
- **Presence infrastructure (`usePresence.ts`/`useOnlineUsers.ts`,
  Realtime Database) already exists** and could inform (not replace)
  notification logic — e.g. deciding whether to also attempt a push
  if someone's already actively online and would see an in-app one anyway.

## A possible phased approach — reference only, not a commitment

1. In-app notification center alone (bell icon, Firestore-backed,
   no new infrastructure) — could ship without touching Cloud
   Functions or the Blaze-plan question at all.
2. Layer in real push once/if the Blaze-on-dev decision is made,
   reusing the same centralized notification-service design so push
   is an addition to the pipe, not a rebuild of it.
3. Scheduled/time-based reminders as a separate, later piece.

## Cross-references

See `docs/PARKED.md` (real external monitoring/alerting — the
admin-side sibling of this same idea), `docs/ARCHITECTURE.md` (no
Cloud Functions, PWA setup), `docs/SCALABILITY.md` (no App Check/
rate-limiting — relevant if this app ever adds its first server-side
credentialed component), `docs/KNOWN_ISSUES.md` (the "no shared
data-access layer" pattern this feature should deliberately avoid
repeating).
