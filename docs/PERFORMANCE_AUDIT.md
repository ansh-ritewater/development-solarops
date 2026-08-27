# Performance & Scalability Audit (Pass 4)

**Investigated 21 August 2026 via fresh, direct measurement — not
carried over from any earlier claim.** Pure documentation — nothing
fixed. Companion to `FILTER_AUDIT.md`, `FEATURE_AUDIT.md`, and
`BACKEND_ROADMAP_AUDIT.md`.

## Bundle sizes — measured fresh, from a genuinely clean build

| Chunk | Last documented | Fresh measured | Verdict |
|---|---|---|---|
| Main bundle (`index-*.js`) | 109.93 kB | 111.34 kB | Grown +1.3% — negligible |
| `TasksPage-*.js` | 95.21 kB | 114.23 kB | Grown +20%, expected — the entire Algolia integration (search, fetch, Load More) lives in this chunk |
| `ReportsPage-*.js` | 13.94 kB | 13.94 kB | Unchanged, byte-for-byte |
| `vendor-firebase-*.js` | 752.35 kB (13 Aug, pre-Algolia) | 752.45 kB | **Unchanged** — 0.1 kB is noise. An earlier comparison in this same investigation initially flagged this as 5x growth; that was a genuine analysis error — comparing an old *gzip-transfer* figure against a *raw* figure, from before this project's own route-splitting work existed. Confirmed Algolia's client doesn't appear anywhere in `vite.config.ts`'s chunking config at all. |

**`vendor-firebase`'s large absolute size (752 kB) is itself a real,
already-documented, pre-existing item** — the Firebase SDK's own
footprint, unrelated to anything built this session. Already tracked
via the Firebase 10→12 SDK upgrade item.

## `syncTaskToAlgolia` — latency and efficiency, confirmed with real
evidence, not assumed

- **Zero added latency to a user's save**, confirmed from Firebase's
  actual trigger model: `onDocumentWritten` fires only after Firestore
  has already committed the write; no client code anywhere awaits
  this function.
- **No before/after diffing — resyncs on every single write,
  unconditionally.** A task edited 10 times with zero search-relevant
  field changes (only remarks/photos) still fires 10 fully redundant
  Algolia writes. Real, quantified inefficiency — not urgent given
  Part 5's invocation-limit math below, but a genuine optimization
  opportunity.
- **No batching** — one individual API call per write, even for a
  bulk upload of hundreds of tasks in quick succession.
- **No error handling, no retry configured** on the Algolia call
  itself — directly relevant to the record-ceiling finding below.

## Listener/polling counts — one real correction found

- Tab-count poll confirmed still 180s (changed from 60s earlier this
  session), unchanged.
- **`useAppConfig()`'s call-site count was wrong in prior
  documentation — stated as 13, genuinely 17 real call sites** (18
  total occurrences including the hook's own definition), each
  opening its own independent, undeduplicated `onSnapshot` listener
  on the same `appConfig/global` document. Corrected here.
- Algolia's own two files (`algoliaSearch.ts`, `fetchTasksByIds.ts`)
  confirmed to open zero persistent connections — both are one-shot
  request/response calls only.

## Reports/Export caps — confirmed unchanged

`ReportsPage.tsx`'s 5,000/500 limits and `fetchAllTasksForExport`'s
20,000 cap all re-confirmed at their real, current line numbers,
exactly as previously documented.

## Algolia-specific scale limits — the most important finding of this pass

- **`fetchTasksByIds`' Firestore chunking confirmed safely bounded
  per-page** — max 2 chunks (60 IDs ÷ 30) per fetch, regardless of how
  many total matches exist across all pages. No risk found here.
- **Algolia's free-tier ceiling (50,000 records) will be reached at
  exactly 50,001 real tasks — HALF of the platform's own stated
  1-lakh (100,000) target, not "close to it."** Confirmed: 1 record
  per task, no multiplication from repeated edits. Real consequence,
  confirmed from the actual code: no `try/catch`, no configured retry
  — new/edited tasks beyond that point would silently stop
  appearing/updating in search results. Graceful degradation, not a
  crash, and doesn't affect the user's actual task save at all. Fixed
  purely by a plan upgrade — no code change required, though adding
  error handling/alerting for this specific failure mode would be a
  reasonable hardening item.
- **Cloud Functions' own free invocation limit (2M/month) is nowhere
  close to being a real constraint**, even at full 1-lakh scale,
  confirmed via real math — the Algolia record ceiling would be hit
  first, by a wide margin.
