# Platform Feature & Enforcement Audit (Pass 2)

**Investigated 21 August 2026 via fresh, direct code reads.** Pure
documentation — nothing fixed as a result of this audit. Companion to
`FILTER_AUDIT.md` (Pass 1).

## Complete route table

| Path | Component | Guard |
|---|---|---|
| `/` | redirect | none |
| `/login` | LoginPage | none |
| `/signup/:inviteId` | SignupPage | none (orphaned system — see PARKED.md) |
| `/dashboard` | DashboardPage | auth only, no role restriction |
| `/tasks` | TasksPage | requireAdminOrField |
| `/proposal` | ProposalPage | requireRole="proposal" (admin passes route, redirected inside page) |
| `/backend` | BackendPage | requireRole="backend" (admin passes route, static message inside page) |
| `/backend-manager` | BackendManagerPage | requireRole="backend_manager" (admin passes route) |
| `/coming-soon` | inline | none (any authenticated user) |
| `/team`, `/template`, `/reports` | respective | requireAdmin (= admin OR view_only) |
| `/error-logs` | ErrorLogsPage | adminOnly (admin only, view_only excluded) |
| `*` | CatchAll | none |

**Confirmed nuance:** `requireRole`'s logic (`role !== requireRole &&
role !== 'admin'`) means admin always passes the route guard for
/proposal, /backend, /backend-manager — the actual admin exclusion
happens inside each page component, not at the route layer.

## ⚠️ The central finding: admin actions are UI-hidden, not code-enforced

Confirmed exhaustively across all 5 admin-facing pages. **This is a
systemic pattern, not isolated cases.**

| Location | Actions audited | Code-level role check? |
|---|---|---|
| `TemplatePage.tsx` | 37 | Only 3 (Admin Tools), and those are client-side `return` only — trivially bypassable |
| `TeamPage.tsx` | 19 | **Zero.** `createUser`, `changeRole`, `setUserActive`, `updateUserName/District/Mobile` — none check the caller's role. `changeRole` could in principle promote users to admin. |
| `TasksPage.tsx` | 5 | **Zero for the mutating ones.** `createTask` (New Task + Bulk Upload) checks authentication only, not authorization. |
| `ReportsPage.tsx` | 2 | Zero — but both are read-only CSV exports, so lower consequence |
| `DashboardPage.tsx` | 11 boot-time mutations | **Zero internal checks.** Only gate is a client-side `if (currentUser?.role === 'admin')`. `ensureSuperAdmin` and `backfillCreatedBy` trust a caller-supplied uid outright. |

**What actually protects the app today:** `firestore.rules`. The
`users` collection requires `isAdmin()` to write, which genuinely
blocks the most serious theoretical cases above. This is a
defense-in-depth gap, not an open door — but it means the app's
security rests entirely on one layer, with no application-level
backup.

**The pattern is provably fixable — this codebase already does it
right elsewhere:** `setSaleClosedManual`, `resetSaleClosedToAuto`,
and `clearStuckCorrectionFlag` (all in `useTaskActions.ts`) correctly
throw `'Not authorized — admin only'`. The knowledge exists; it just
wasn't applied consistently.

## ⚠️ Two confirmed UI-vs-rules mismatches (both directions)

1. **UI too permissive:** Template Save buttons (taskTemplate,
   documentTemplate, districtsByState, leadSources, saleClosedConfig,
   backendCashSteps, backendLoanSteps) are gated only by
   `!isViewOnly` — so they appear **enabled** for field/proposal/
   backend/backend_manager, whose writes then fail server-side.
   A real, if minor, user-facing bug: a visibly-enabled button that
   silently cannot work.
2. **Rules too permissive:** the Admin Tools panel is UI-gated to
   `role === 'admin'`, but its underlying `pipelineCounts`/
   `engineerCounts`/`districtCounts` writes are rule-permitted for
   field/proposal/backend as well — broader real access than the UI
   suggests.

## Role experience matrix (confirmed from code)

| Role | Real experience |
|---|---|
| `admin` | Full access everywhere; /proposal and /backend redirect/no-op by design |
| `view_only` | Nearly identical to admin, except: /tasks action buttons hidden (isAdmin-only), and /error-logs blocked entirely |
| `field` | The only role with no dedicated route — /tasks and /dashboard render different internal branches instead |
| `proposal` | Own portal; actively redirected away from /tasks at the route layer, before the component mounts |
| `backend` | Same shape as proposal, own portal |
| `backend_manager` | Own read-only portal; confirmed structurally read-only (no mutation hook imported) |
| `logistics`, `installation` | Most restricted; only roles sent to /coming-soon. No dedicated dashboard branch or portal — consistent with PARKED.md's existing note that these are vestigial |

## FEATURES.md cross-check

**Confirmed accurate:** the 8-role list, requireAdminOrField routing,
ProposalPage's admin redirect, BackendPage's admin static message,
BackendManagerPage's read-only claim, the Admin-Tools-reduced-from-7-
to-3 history, the initAppConfig boot sequence and its localStorage
caveat, the Reports 5,000/500 vs Tasks 20,000 caps, TeamPage's
no-delete-only-disable behavior, and the dual create-user/invite-path
finding — all independently reconfirmed, no discrepancies.

**Genuinely missing from FEATURES.md — the entire enforcement
question.** It documents exhaustively what every button *does*, but
never once asks whether the underlying write is actually protected
beyond UI visibility. Every finding in this document's central section
is absent from it. `firestore.rules` is never mentioned as the real
enforcement backstop for any action.

## Note on this audit's own completeness

The per-item detail behind TemplatePage's 37 and TeamPage's 19 audited
actions was produced during investigation but only the synthesized
conclusions were captured into this document. The conclusions are
specific and directly actionable; the underlying per-button line-by-
line detail would need re-capturing if ever required for a formal
security review.
