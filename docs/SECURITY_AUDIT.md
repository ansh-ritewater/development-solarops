# Security Audit (Pass 5, Final)

**Investigated 21 August 2026 via a fresh, complete re-read of
`firestore.rules` plus real Algolia documentation verification.**
Pure documentation — nothing fixed. Final pass, synthesizing
`FILTER_AUDIT.md`, `FEATURE_AUDIT.md`, `BACKEND_ROADMAP_AUDIT.md`,
and `PERFORMANCE_AUDIT.md`.

## Per-collection worst-case analysis, field role (lowest-privileged
real role)

| Collection | Worst attempt | Stopped? |
|---|---|---|
| `users` | Read every user's full PII | **No** — already documented, reconfirmed |
| `appConfig` | Write ANY value (not just permitted keys — the rule never validates values, only which keys changed) into the 4 shared counter fields | **No** — new nuance: value-blind, not just key-scoped |
| `invites` | Read every pending invite | **No**, but low consequence — orphaned system |
| `tasks` (update) | Alter ANY field on own assigned task — reassignment, pipelineStage, saleClosed, state/district/leadSource, correctionReturnTo, archived | **No** — confirms the UpdateTaskDrawer gap at the rules layer directly |
| `tasks/updates` | Forge a plausible new history entry on own task | Partially — tampering with EXISTING entries is hardcoded `false` for every role including admin |
| `tasks/stages` | **NEW, found only by this pass**: retain write access to every stage subdocument of own task forever, including stages the task has already moved past | **No** — compounds the top-level gap one level deeper |
| `errorLogs` | Flood with unlimited garbage entries | **No** — already documented rate-limiting gap, reconfirmed |

## Algolia key security — verified against real documentation, not assumed

- **Search key** (frontend, `.env.local`): confirmed via Algolia's own
  current docs — a search-ACL key is strictly read-only; cannot add,
  delete, or modify records or settings under any circumstance. Safe
  to expose in the browser by design.
- **Write key**: confirmed via a full git-history pattern search —
  never appears as a real value anywhere, only ever referenced by
  name/environment variable. Zero leaked key values found anywhere in
  tracked content.

## Backend admin-SDK scope — all three confirmed appropriately bounded

`syncTaskToAlgolia` touches only its one triggering document.
`backfillAlgolia.ts`'s full-collection read confirmed intentional and
necessary for a one-time backfill, not overreach. `configureAlgoliaIndex.ts`
makes zero Firestore calls at all.

## ⚠️ The most important finding of this entire 5-pass audit

**Cross-cutting risk, only visible by combining two separate findings:**
`PERFORMANCE_AUDIT.md` established `syncTaskToAlgolia` propagates
every write unconditionally, with zero validation of what changed.
This pass's fresh rules read confirms a field-role user can alter any
field on their own assigned task. **Combined: a field engineer could
fraudulently mark their own task `saleClosed: true`, or fabricate its
state/leadSource, and that fabricated data automatically propagates
into the search index — visible platform-wide to every admin/view_only
user browsing filtered tabs, not confined to one document someone
would need to specifically inspect.** Neither document alone captured
this propagation effect.

## Confirmed: no security dimension

The Search+State/Lead-Source regression (`FILTER_AUDIT.md` #10) has
zero security angle — confirmed it only affects data the user was
already authorized to see, no privilege escalation, no cross-user
leak.

## Confirmed: no second cross-cutting finding exists

Checked deliberately; only the one above was found. Stated plainly
rather than manufactured.
