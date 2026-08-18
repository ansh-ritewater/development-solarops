# SolarOps — Not Yet Investigated

**Last updated: 11 August 2026**
This file is deliberately different from `PARKED.md` and `SUGGESTIONS.md`.
Those two hold things that were *found* — confirmed or flagged, then
deliberately deferred. **Everything below has never been looked at, in
either direction.** Not confirmed safe, not confirmed broken. Genuinely
unknown, because the method needed to find out has never been used —
this session's work has been entirely "read the existing code and
measure the existing running app." These six categories need a
different method each, most requiring something this chat alone cannot
produce (real load, real people, real devices).

**If any of these are ever investigated, move the finding into
`PARKED.md`/`SUGGESTIONS.md` and remove it from this file — this file
should only ever contain genuinely un-investigated items.**

## 1. Load testing under real concurrency

Every scaling claim in `SCALABILITY.md`/`PERFORMANCE.md` is inferred
from reading code plus one production snapshot at ~750 tasks and a
handful of concurrent users. Nobody has ever scripted 50 simultaneous
writes against `appConfig/global` and watched what actually happens —
whether it degrades gracefully, queues, or throws. The 1-write/second
document-contention ceiling discussed throughout this project's history
is a documented Firestore limit, not a measured failure point for this
specific app's write patterns.

**Method needed:** Firebase emulator + a scripted load generator
(e.g. simulate N concurrent `adminOverrideStage`/`submitDocuments`
calls) against a disposable test project — safe, reproducible, doesn't
touch dev or prod data.

## 2. Real user / usability review

No one has watched a field engineer actually use the survey form,
photo capture, or offline flow on their own device, in their own
working conditions (outdoors, poor signal, one-handed, sun glare).
Every UX judgment in this project has come from either Ansh's own use
or an AI reading screenshots/code — neither is a substitute for
watching a real, unprompted user attempt a real task.

**Method needed:** a structured usability session with 1-2 actual
field engineers, ideally in the field, not in an office.

## 3. Accessibility beyond automated scoring

Lighthouse's 94-95 accessibility score (see `PERFORMANCE.md`) covers
only what automated tooling can detect — contrast, ARIA presence, tab
order. It does not confirm the app is actually usable with a screen
reader, voice control, or by someone with a real motor/visual
impairment. No manual assistive-technology testing has ever been done.

**Method needed:** manual testing with a screen reader (e.g. NVDA/
VoiceOver) by someone who actually uses one, not a sighted person
turning one on briefly.

## 4. Workflow / business-rule gap analysis

Every bug fixed this session was found reactively — either Ansh hit it,
or an audit tool flagged existing code. Nobody has proactively sat down
with the real 6-stage pipeline and asked "what real-world situation
does this NOT currently handle at all" (as opposed to "handles
incorrectly"). There may be entire business scenarios the app has no
representation for whatsoever.

**Method needed:** a structured walkthrough of real field-operations
scenarios against the documented pipeline in `PIPELINE_FLOW.md`,
led by someone with direct field/sales-ops experience — likely Ansh
and/or the actual team, not code analysis.

## 5. Production error monitoring / alerting

Distinct from the other 5 items — this one is not really an
"investigation" gap, it's a known, already-`PARKED.md`-listed
implementation gap being restated here for completeness: any real bug
happening right now, live, to a real user, is invisible unless someone
manually opens `/error-logs`. No proactive alerting exists. Of the six
items in this file, this is the most straightforward to close — it's
implementation work, not investigation.

**Method needed:** a real external monitoring/alerting integration
(e.g. Sentry-style) — see the existing `PARKED.md` entry for this same
gap.

## 6. Competitive / domain benchmarking

SolarOps has never been compared against what a mature field-operations
/ solar-installation-management platform actually offers elsewhere.
There may be entire categories of value (reporting depth, mobile-native
features, integrations) that competitors have and SolarOps has never
been evaluated against.

**Method needed:** deliberate market/competitor research — a business
decision about what to look at and why, not a code or measurement task.

## Ansh's review, 14 August 2026

Reviewed all six categories in this file, plus the separate
Hygiene/cleanup list in `PARKED.md`. Decision: leave every item in
both lists exactly as-is for now — nothing here is urgent given the
app's current real usage (~800 tasks, still early/free-trial scale).

Two items flagged as worth prioritizing whenever this list is picked
back up, specifically because they need a human watching a human
rather than more code investigation (unlike almost everything else
done this session): **real field-engineer usability review** (#2)
and **workflow/business-rule gap analysis** (#4) — the latter
specifically needs Ansh's own domain knowledge, not code reading, to
even begin. The other four (load testing, accessibility, production
monitoring, competitive benchmarking) can wait indefinitely with no
real downside.

## Honest summary

The existing SolarOps codebase — frontend, the absence of a real
backend, database schema and query patterns, cloud configuration,
security rules, and performance across load/runtime/per-action — has
been audited thoroughly: seven independent external AI tools plus
direct code verification, cross-validated, with false claims caught
and discarded (see `TRACKER.md`'s audit session entries).

**That is a complete audit of what exists. It is not a complete
picture of everything that could be wrong or missing** — these six
categories have zero coverage in either direction, because their
methods were never used, not because they were checked and found fine.
