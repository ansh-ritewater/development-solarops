# SolarOps — Known Issues & Root-Cause Patterns

**Last updated: 6 August 2026**
This file exists to capture *why* real bugs happened, not just that
they were fixed — so the same mistake pattern is recognizable if it
resurfaces somewhere else in the code later.

## Pattern: two fields that sound similar, aren't, and get conflated

**`status` vs. `pipelineStage`** — `status` (pending/in_progress/
blocked/completed) means "has the survey been submitted," and freezes
forever the moment it's set. `pipelineStage` tracks which of the 6 real
stages a lead currently occupies, including the final `completed`
(meaning fully Converted). These are NOT the same "completed." This
exact conflation caused a real, confirmed production bug:
`adminOverrideStage` had a rule checking `status === 'completed'`
(true for almost any post-survey task) to decide whether to reset it
to `'pending'` — intended to handle un-converting a fully-closed deal,
but firing on nearly every ordinary Admin Override move instead. Fixed
6 Aug 2026; 13 corrupted dev tasks repaired via a dedicated tool.
**Lesson: whenever new logic checks or sets `status`, verify explicitly
whether it should instead be checking `pipelineStage`, and vice versa.**

## Pattern: a badge/count and its corresponding list quietly disagree

Multiple times this session, a tab's number (badge/Dashboard card) and
the actual list of tasks under that tab were computed by *different*
logic that happened to diverge — e.g. the list correctly excluded
corrected tasks while the badge's raw counter didn't, or the Dashboard
subtracted a correction count while the Tasks page never did. **Lesson:
whenever a count and its corresponding list are built by two separate
code paths, they need explicit, deliberate reconciliation — never
assume they'll naturally agree.**

## Pattern: a fix accidentally relied on a bug's side effect

When fixing the `status` corruption bug, `needsResurvey` was built to
restore visibility specifically for Full-Restart-to-Survey tasks — but
Quick-Correction-to-Survey tasks had *also* been accidentally relying
on the same broken `status`-reset behavior for their own visibility in
the field engineer's main view. Fixing the root bug correctly removed
that accidental side effect too, breaking something that looked
unrelated. **Lesson: before fixing a bug, check whether anything else
in the app might be silently depending on its incorrect behavior as a
feature.**

## Pattern: no shared data-access layer means every consumer needs its own fix

`useAppConfig` (and most data-reading hooks) are NOT a single shared
store — each component/hook that reads a piece of Firestore data opens
its own independent subscription and does its own field mapping. This
is why the Sales Closed mapper-gap bug (see TRACKER.md) required the
identical fix in 4 separate files (`useTasks.ts`, `useProposalTasks.ts`,
`useBackendTasks.ts`, `EngineerDetailDrawer.tsx`) rather than one shared
place. **Lesson: when adding a new field to Task or AppConfig, check
every file that independently reads that collection — there is no
single choke point that guarantees it's covered everywhere.**

## Stale-file and stale-server mistakes (process, not code)

Multiple times this session, an old file attachment with the same
generic filename was mistaken for a fresh one, leading to analysis of
outdated output. **Lesson: always check a file's actual reported
modification timestamp before trusting its content as current — never
assume the most recently *mentioned* file is the most recently
*attached* one.**

If a fix seems to have no effect despite a clean `tsc`/build/`git diff`
confirming the source file changed correctly, check for a stale
running dev server before suspecting the fix itself — a full restart
(`npm run dev`) plus a hard browser refresh (Ctrl+Shift+R) should be
the first troubleshooting step, not the last.

### taskNum prefix search — RESOLVED IN DEV, NOT YET IN PRODUCTION (5 Sep 2026)
**Bug:** Proposal portal, Backend portal, and Backend Manager page task-
number search (`useStageTaskList.ts`) matched only the exact task number
typed, not prefixes — searching 'T-15' would find nothing unless a task
was literally named exactly 'T-15'. The admin Tasks page was NOT affected
(its search lives in useTasks.ts, which was always correct).

**Root cause:** Firestore prefix-range search requires a private-use-area
Unicode sentinel character (U+F8FF) appended to the query's upper bound —
`where('taskNum', '<=', term + '\uf8ff')`. useStageTaskList.ts was missing
this character; likely lost during an earlier copy from useTasks.ts (the
line's own comment read "Mirror the exact >= / <= '' pattern used in
useTasks.ts", suggesting the character was dropped in transit).

**Why this was hard to detect — a real methodology lesson:** U+F8FF is
invisible in every normal view of the code — a code editor, `cat`, a zip
file, or a text-based `grep` for its escape sequence (`grep "f8ff"` or
`grep "\\uf8ff"`) all return clean 'not found' results whether the
character is genuinely present OR genuinely absent, because those searches
look for the literal ASCII text of the escape sequence, not the actual
Unicode codepoint. This produced a confidently wrong 'confirmed absent
everywhere' conclusion earlier in the investigation, which a live UI test
(typing a partial task number and observing the real result) directly
contradicted. **Lesson for future debugging: an invisible/private-use-area
character can only be confirmed present or absent via a byte-level /
codepoint-level check (e.g. Python `ord()` on each character), or a live
functional test — never by reading code or by text-based grep, no matter
how targeted the search string.**

**Status:** Fixed in dev (`src/hooks/useStageTaskList.ts:180`), committed,
live-tested on all 3 affected portals. **NOT yet deployed to production**
— production still has the exact-match-only bug on these 3 portals until
the next deployment cycle.
