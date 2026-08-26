# Tasks Page — Complete Filter Combination Audit

**Investigated 19 August 2026, via direct, fresh code reads — not
carried over from any earlier claim in this project's history.**
Pure documentation of current reality. Nothing in this file has been
fixed yet; this is the complete map of what's true today, good and
bad, before any further work begins.

## The real, current mutual-exclusion rules (confirmed from code)

| Filter | Clears, when set | Disabled when active |
|---|---|---|
| State | District, only if now incompatible (cascade) | Never |
| District | Created Date + Due Date, unconditionally | Created Date or Due Date active |
| Engineer | Created Date + Due Date, unconditionally | Created Date or Due Date active |
| Lead Source | Nothing | Never |
| Created Date | Engineer + District + Due Date; resets Tab to "All" | Engineer, District, or Due Date active |
| Due Date | Engineer + District + Created Date; resets Tab to "All" | Engineer, District, or Created Date active |
| Tab (any of 19) | Created Date + Due Date, on every click | Only by role (adminOnly/fieldOnly) |
| Search | Nothing | Never |

**Key derived fact, confirmed precisely:** Created Date and Due Date
can never coexist with any tab except "All" — selecting either forces
the tab back to "All," and clicking any tab clears both dates. The
original State+Date/Due-Date fix therefore never needed to cover any
other tab — its scope was always correctly bounded by this rule.

## Complete combination matrix

| # | Combination | Real mechanism | Classification |
|---|---|---|---|
| 1 | Any single tab, alone | Own query, capped at 50 | Fine — no state/search in play |
| 2 | 17 covered tabs + State/Lead Source (no Engineer/District/Date) | Algolia | Fixed, confirmed working |
| 3 | `my_tasks` + State/Lead Source | Falls back, capped-50 batch, client-filtered | **Pre-existing limitation, already parked** — can silently miss data at volume |
| 4 | `archived` + State/Lead Source | Zero effect whatsoever, both live list and export | **Pre-existing bug, already parked** — not a low-volume edge case, a total no-op, every time |
| 5 | Engineer set (any tab/state/search) | Capped-50, client-filtered afterward, ignores state/leadSource/search server-side entirely | **Pre-existing limitation, unrelated to any work this session** — can silently miss data at volume |
| 6 | District set (same shape as #5) | Same pattern | **Pre-existing limitation, unrelated to any work this session** |
| 7 | Date/Due-Date + State/Lead Source | Genuine complete server-side query | Confirmed correct — the original fix |
| 8 | Date/Due-Date + **Search** | Search not included in this query at all | **Pre-existing limitation** — relies on client-filter narrowing afterward, same general risk class as #5/#6 |
| 9 | Search alone, or Search+Engineer/District | 2-3 sub-queries each capped at 50, merged | **Pre-existing, already documented, explicitly by design** per existing code comment |
| 10 | **Search + State/Lead Source, on any of the 17 covered tabs** | `canUseAlgolia` never checks Search; the only code path that applies Search only runs on Algolia failure, never success | **NEW, genuine regression from this session's own Algolia work.** Not a capped-data risk like the others — a guaranteed, total, silent failure: the search box does literally nothing, every single time, with zero error or indication. Confirmed via direct code read, not assumed. **NOT YET FIXED — flagged for a future pass, per Ansh's explicit instruction to document now, fix later.** |

## Excel export vs. the live list — confirmed for every risky combination above

For every row classified as a capped-data risk (#3, #5, #6, #8, #9),
directly confirmed: the Excel export always drains the *complete*
matching result (bounded only by the shared 20,000-row ceiling),
while the live screen caps at 50/60/200 per fetch. This is the
already-parked "Excel export consistency" item — now confirmed with
full specificity per combination, not just a general claim. Same
already-parked scope, no change.

For `archived` (#4) specifically: the export has its own dedicated
branch that also never applies State/Lead Source — confirmed the
live list and the export are *equally* blind here, not disagreeing
with each other, just both wrong in the same way.

## TAB_CONDITION coverage — confirmed complete, nothing hidden

19 real tab values exist. 17 have an explicit entry in
`algoliaSearch.ts`'s `TAB_CONDITION`. The 2 missing (`my_tasks`,
`archived`) are both deliberate, both already documented, and both
correctly return an explicit `null` (not an accidental `undefined`)
when hit — confirmed via direct code read, not assumed.

## Summary — what this audit changes

**Nothing has been fixed as a result of this audit.** Its purpose was
to produce a complete, evidence-based map before deciding what to
work on next. One genuinely new item was found (row #10) and is now
properly tracked. Every other row was either already known and
correctly parked, or is a pre-existing limitation now confirmed with
full precision instead of a general claim.
