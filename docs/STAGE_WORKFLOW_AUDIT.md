# Stage Workflow Audit — Field Review, Proposal, Backend

**Investigated 22 August 2026 via fresh, direct code reads.** Pure
documentation — nothing fixed. Companion to the 5-pass platform audit
and PRODUCT_GAPS_AUDIT.md.

## Field Review — confirmed 3 real outcomes, one genuine asset

Accept, Request Revision, Reject — confirmed genuinely distinct
outcomes, not two labels on one action. Request Revision returns the
task to Proposal; Reject is the real drop path (confirms
PRODUCT_GAPS_AUDIT.md's Gap 2 finding precisely). **Genuinely useful
asset for later**: this is the one stage transition in the entire app
that already writes a real, dedicated `decidedAt` timestamp separate
from `stageHistory` — a working precedent for Gap 5's lifecycle-
duration tracking, if that's ever built.

## Proposal team — confirmed workflow, one labeling nuance

Exactly two real write actions: submit proposal documents, and
edit/save a Proposal Remark. Two free-text fields confirmed:
`proposalRemark` (absent from Excel export, confirms Gap 6
independently from the write side) and "Note for Field Engineer"
(`proposalNote`). **Nuance, not a bug**: this note's real recipient
can be Backend instead of the field engineer, depending on how the
task was routed — a dedicated function already exists to compute the
correct label; the data is never lost, only the drawer's static text
is sometimes technically inaccurate about where a note is headed.

## Backend team — confirmed workflow, two integrity gaps

Six real write actions confirmed, including the Application Journey
mechanism (16 Cash / 18 Loan admin-configurable steps, frozen onto a
task at initialization — later admin template changes don't
retroactively affect in-progress tasks). Two free-text fields
confirmed: `backendRemark` (also absent from export, confirms Gap 6)
and a per-step remark, correctly locked once that step is marked done.

**Two real integrity gaps, both currently theoretical:**
- Payment type "can't be changed" is UI-only — the write function
  itself has no guard against being called twice on the same task.
- "Mark as Converted" isn't re-verified server-side — the function
  trusts the caller's claim that all steps are done, rather than
  checking for itself.

## Cross-stage data flow — confirmed clean

Nothing found lost or duplicated moving between stages. Field Review
correctly sees Proposal's document and note; Backend correctly sees
Proposal's remark; a Revision Requested note correctly surfaces back
to Proposal. Admin's own view (TaskDetailDrawer) correctly shows both
remarks together — no cross-stage blind spot for the one role that
needs the full picture.

## ⚠️ Two new instances of this project's repeated "duplicate logic
could drift" pattern — bringing the running total to 6

Confirmed by direct code comparison, not inferred:

1. **Field Review's next-stage decision** — the "Accept" button's
   displayed destination text and the actual transition logic each
   independently compute whether a task needs Documents or can skip
   to Backend, using two separate reads of the same config. A change
   to the document template in the narrow window between render and
   click could make the two disagree.
2. **Proposal revision numbering** — the live drawer and the
   historical view each independently reimplement the same
   "Revision 1 stays Revision 1 even shown newest-first" logic, from
   the same underlying data, via two separately-written computations.

**Explicitly distinguished as lower-risk, same investigation:**
Application Journey completion percentage appears in 7 files, but
every site reads the same stored value — real duplication, not the
same "two independent answers that could disagree" risk class as the
two items above.

## Authorization — consistent with the rest of the app, rules-backstopped

Same pattern already found everywhere else: zero code-level checks
that the caller is genuinely assigned to the task, across all 8
Proposal/Backend write functions. **Confirmed, specifically for this
pass**: Firestore's rules genuinely do provide a real document-level
backstop here (`isProposal() && proposalAssignedTo == uid`,
`isBackend() && backendAssignedTo == uid`) — the same defense-in-depth
gap as the rest of the app, not a uniquely open door for these roles.
