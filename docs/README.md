# SolarOps Project Documentation

**Claude: read every file in this folder at the start of any SolarOps
session, before doing anything else. Update the relevant file(s)
before ending any session where something was fixed, built, deployed,
or newly discovered. This is not optional — these files are the
project's actual memory, and they only stay useful if kept current.**

## The document set

- `TRACKER.md` — current deployment status (dev vs production) and a
  chronological log of what's been done.
- `FEATURES.md` — catalog of what the app actually does, feature by
  feature, and where the code for each one lives.
- `PARKED.md` — every known bug or improvement that's been deliberately
  deferred, with why, and enough detail to pick back up later.
- `SUGGESTIONS.md` — real findings that don't currently harm anything
  and aren't active work; a lower-priority sibling to `PARKED.md`.
- `NOT_YET_INVESTIGATED.md` — six categories with zero coverage in
  either direction (load testing, real-user UX, manual accessibility,
  workflow gap analysis, production monitoring, competitive
  benchmarking). Different from `PARKED.md`/`SUGGESTIONS.md`, which
  hold things that were found — this file holds things never looked at.
- `KNOWN_ISSUES.md` — root-cause explanations of real bugs found and
  fixed, so the same *pattern* of mistake is recognizable if it shows
  up somewhere else later.
- `ARCHITECTURE.md`, `SCHEMA.md`, `PIPELINE_FLOW.md` — deeper technical
  references, built from careful fresh reads of the real code.
- `SCALABILITY.md` — code-derived scaling analysis ahead of the
  1-lakh-task goal. Note: its *performance* claims were inference from
  reading code and are superseded by the measured findings in
  `PERFORMANCE.md`; its scaling/cost analysis still stands.
- `PERFORMANCE.md` — the first real *measured* performance audit
  (Lighthouse + Network panel + targeted code reads, 10 Aug 2026).
  Supersedes the inferred performance claims in `SCALABILITY.md`.
- `NOTIFICATIONS.md` — research and design reference for in-app and
  push notifications. Research only; nothing built.

## Two separate projects — do not confuse them

- **`D:\Development-SolarOps`** — Firebase project `development-solarops`.
  All work, testing, and experimentation happens here. Has its own git
  repo, pushed to `github.com/ansh-ritewater/development-solarops`.
- **`D:\SolarOps`** — Firebase project `solarops-ritesolar`. This is
  the real, live production app with real user data. It has its own
  separate git repo which is intentionally NOT used as part of this
  workflow — deployment happens via manual file copy plus explicit
  `firebase deploy` commands, never automatically, never silently.
  Nothing ever gets built or tested directly here.

**Never copy `.env.local` or `.firebaserc` between the two folders** —
each must keep pointing at its own correct Firebase project.

## `docs/` itself is dev-only — NEVER deploy this folder

This entire `docs/` folder exists only in `D:\Development-SolarOps`'s
git repository, for development reference. **It must never be copied
to `D:\SolarOps` or deployed to production in any form** — it contains
internal notes, known risks, and audit findings that have no reason to
ship as part of the live application. Every deployment file-copy list
(see TRACKER.md's "Next deployment checklist") is an explicit,
named list of specific files — never a broad folder copy — precisely
so this can never happen by accident.

## How Claude (chat) and Claude Code actually work together

This matters and should never be assumed away: **Claude, in this chat,
has no direct access to the real project files on this machine.**
Claude's own tools operate in a separate sandbox that may hold an
outdated copy of the code. The only real information pipeline is:

1. Claude writes a precise, scoped prompt (read-only or implementation).
2. The person runs that prompt in Claude Code, on the actual machine,
   against the actual files.
3. The person pastes Claude Code's real output back into the chat.
4. Claude reads that real output — and only that — before saying
   anything is confirmed, fixed, or true.

Claude should never assume something is true, fixed, or unchanged
without a fresh, real read confirming it — including re-verifying
things from earlier in the same conversation if meaningful time or
work has passed. When in doubt, ask for a fresh read rather than trust
memory, chat history, or a previous file attachment (attachments can
be stale copies from earlier in the conversation — always check a
file's actual reported modification time before treating it as current).
