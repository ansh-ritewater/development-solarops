# Backend Architecture — Phase 1 Plan (Search/Filter Fix)

**Approved by Ansh's leadership, 19 August 2026.** This is the first
piece of backend infrastructure ever built for SolarOps. Nothing in
this document is implemented yet — this is the plan, written before
any code, per this project's established discipline.

## Why this exists
Confirmed 19 Aug 2026, in real production: State and Lead Source
filters, on any tab except Created-Date/Due-Date, silently show
incomplete results for any state/lead source with lower task volume
or lower pipeline-stage priority than the top ~50 raw-fetched tasks.
Confirmed structural, not a one-off bug — will recur for every future
state added, and for any future filter idea on Tasks, under Firestore's
architecture. Full mechanism already documented in `PARKED.md`'s
"State filter — full scope for later" section.

## Chosen approach
Add Algolia (free tier) as a dedicated search/filter index, kept in
sync with Firestore via a Cloud Function. State and Lead Source route
through Algolia; Engineer, District, and the live task list stay
exactly as they are today — they already work correctly and have a
real-time property (instant updates) worth preserving, which Algolia's
sync has a small natural delay on.

## Key design decision: Option B (index-only, not a second source of truth)
Algolia is used ONLY to answer "which task IDs match this filter."
The actual data shown on screen is always fetched fresh from Firestore
for those matching IDs — never displayed directly from Algolia's own
copy. This guarantees there is never a moment where stale data is
shown, at the cost of one extra lookup step. Chosen deliberately over
the faster-but-riskier alternative of trusting Algolia's copy directly.

## What gets synced to Algolia — deliberately minimal
Only: task ID, title, task number, state, district, lead source,
assigned engineer, pipelineStage, status, saleClosed, createdAt,
updatedAt, dueDate. Explicitly NEVER synced: photos, remarks, the
embedded survey template snapshot (confirmed ~8.6KB alone — Algolia's
free tier caps records at 10KB; syncing full task documents risks
exceeding this on some tasks). This is also correct security/hygiene
practice independent of the size limit — sync only what's genuinely
searchable.

## Security: the two-key separation
Algolia issues a "search-only" key (safe to ship in the frontend — can
query, cannot ever modify data) and a separate admin key (can write/
reindex — must live ONLY in Cloud Functions' secure config, never in
any frontend-reachable code). Getting this separation right is a real
security requirement, not a convenience detail.

## Edge cases planned for in advance
- Task created/edited while offline — syncs automatically once the
  normal save completes on reconnect; no special handling needed, but
  explicitly test this scenario before considering Phase 1 done.
- Task archived — must disappear from search results immediately,
  matching every other filter's existing behavior.
- Algolia temporarily slow/unreachable — must fail gracefully (fallback
  behavior or a clear message), never a blank crash — ties into the
  ErrorBoundary work already shipped.
- Search-index drift over time — same class of problem as the counter-
  drift issue already observed live in production once. Build a
  "Verify Search Index" diagnostic check from day one, not as an
  afterthought, learning directly from that earlier experience.

## Build sequence (dev only, nothing near production until fully proven)
1. **DONE 19 Aug 2026** — Cloud Functions set up in dev for the first
   time in this project's history. `pingBackend` (a trivial HTTP test
   function) deployed successfully and confirmed responding with a
   real 200 response and correct JSON, verified directly in browser
   by Ansh. One real obstacle hit and resolved: the Cloud Build
   service account had no IAM roles granted by default on this
   project (fixed by Ansh granting "Cloud Build Service Account" and
   "Artifact Registry Writer" to the default compute service account).
   A second obstacle — 2nd-gen functions default to requiring
   authentication — was resolved by deliberately setting this ONE
   temporary test function to "Allow public access," since it holds
   no data and no sensitive logic; every real function built from
   here on should default back to requiring authentication unless
   there's a specific, deliberate reason not to. Runtime bumped to
   Node 22 and `firebase-functions` updated to latest before
   considering this step done, since Node 20 was already flagged for
   decommission 30 Oct 2026 — not worth building on a runtime already
   on a deprecation clock.
2. Create Algolia account + dev-only index; generate both keys; store
   the admin key only in Cloud Functions' secure config.
3. **DONE 19 Aug 2026** — `syncTaskToAlgolia` built and deployed,
   triggered on every Firestore write to `tasks/{taskId}`. Three
   real corrections made during build, found by checking actual
   evidence rather than assumption: (a) the initially-planned
   Algolia client API (`client.initIndex()`) doesn't exist in the
   version that actually installs today — confirmed via the real
   library's own type definitions and rewritten against the true
   v5 API (`client.saveObject({indexName, body})`); (b) the assumed
   field names `engineerUid`/`engineerName` don't exist on the real
   `Task` type — the actual fields are `assignedTo`/`assignedToName`,
   caught by reading `src/types/index.ts` fresh rather than guessing;
   (c) the function was initially deployed hardcoded to
   `us-central1`, but this project's real Firestore database lives
   in `asia-south1` (confirmed via `firebase firestore:databases:get`)
   — corrected and redeployed successfully.
   - **Confirmed working via real Algolia dashboard evidence, not just
     function logs**: creating a new task AND editing an existing one
     both correctly appeared in `tasks_dev` with correct titles and
     object IDs. Measured average record size: 327.5 bytes — direct,
     real confirmation the "sync only minimal fields" design decision
     holds in practice, comfortably under Algolia's 10KB record cap.
   - **One real security incident during this step**: the Algolia
     Write API Key was accidentally printed in plain text while
     checking whether the secret already existed (wrong command used
     for what should have been a simple existence check). Caught and
     disclosed immediately. **Resolved same day**: Ansh generated a new
     key in Algolia, ran `firebase functions:secrets:set
     ALGOLIA_WRITE_KEY` again, and confirmed via real CLI output that
     Firebase detected the function was still on the stale version,
     redeployed it onto the new one, and explicitly removed the old,
     exposed version — not just replaced-in-name.
   - Deletion (the third case `onDocumentWritten` handles) not yet
     tested — no task has been archived/deleted since deployment. Code
     path written and compiled cleanly; genuinely untested in practice.
4. **DONE 19 Aug 2026** — `backfillAlgolia.ts` written as a one-time,
   manually-run script (never a deployed function, never triggered
   automatically) reusing the exact field mapping already proven in
   `syncToAlgolia.ts`. One real bug caught before running: the
   initial draft read the correct source fields (`assignedTo`/
   `assignedToName`) but wrote them under the wrong output keys —
   corrected to match `syncToAlgolia.ts` exactly, so backfilled and
   newly-synced records are never inconsistent with each other.
   **Real obstacle hit and resolved**: running locally (not as a
   deployed function) meant this machine had no Google credentials
   available by default — resolved via `gcloud auth application-
   default login`, a one-time authorization tied to Ansh's own
   Google account, no key files created or left behind.
   - **Confirmed 19 Aug 2026: run successfully by Ansh, verified via
     the real Algolia dashboard, not just the script's own output** —
     read 159 real tasks from Firestore, uploaded all 159 to the
     `tasks_dev` Algolia index in one batch, zero failures. Dashboard
     independently confirms "# records: 159," matching exactly.
5. Build the frontend piece: query Algolia for matching IDs, fetch real
   data from Firestore for those IDs (Option B above).
6. Wire this specifically into State and Lead Source filters only —
   Engineer, District, every tab's base query stays untouched.
7. Update Excel export and "Load More" so all three (list, export,
   load-more) stay consistent — matching this project's established
   discipline around exactly this class of inconsistency.
8. Test every edge case above deliberately, one at a time.
9. Document what was actually built (update this file to reflect
   reality, not just the plan).
10. Repeat this project's established audit-then-deploy process, with
    a SEPARATE production Algolia index, before touching real data.

## Explicitly deferred to later phases (not part of this build)
Everything already consolidated in `PARKED.md`'s backend-dependent
list (App Check/rate-limiting, counter-drift centralization, errorLogs
write limits, custom auth claims, push notifications, appConfig write
contention) — see that file for the authoritative, single tracked
list. This document covers Phase 1 (search) only.

---

## Future feature ideas enabled once backend infrastructure exists
**Brainstormed 19 Aug 2026 — none of these are decided, scoped, or
committed to. Purely a list so good ideas aren't lost once the
capability exists.** All of these are currently impossible or unsafe
to build without backend code, specifically because they each need a
secret credential or a scheduled/server-side action a browser cannot
safely hold or perform.

- **Automated WhatsApp/SMS updates to customers** — "your survey is
  scheduled," "your subsidy has been sanctioned" — without exposing a
  messaging API key to the frontend.
- **A public, scoped customer status-tracker link** — a simple
  "track my installation" page sent to the customer, showing only
  their own lead's status, without giving them real app access.
- **Government subsidy-portal automation** — checking/submitting
  subsidy application status automatically, holding those portal
  credentials safely server-side.
- **Scheduled reminders** — "this lead is overdue," "you have 4
  pending tasks today" — needs a server-side clock; a closed app
  can't check anything on its own.
- **Server-side PDF generation** for proposals/formal quotations —
  more reliable and consistent than client-side generation, and can
  be emailed automatically once generated.
- **Automated weekly summary reports** emailed to leadership,
  generated and sent on a schedule.
- **Accounting-software integration** (e.g., pushing completed sales
  into Tally/Zoho Books automatically) — needs secure credential
  storage.
- **Smarter duplicate-lead detection** during bulk upload, using
  fuzzy matching server-side instead of simple exact-match.
- **Post-completion customer feedback requests**, sent automatically
  a set number of days after a project completes.
- **Multi-branch/multi-company support**, if Rite Solar expands —
  meaningfully cleaner to build once shared logic is centralized
  server-side rather than duplicated across client code.
