import { liteClient } from "algoliasearch/lite";
import type { AdminFilter } from "@/hooks/useTasks";

const APP_ID = import.meta.env.VITE_ALGOLIA_APP_ID as string;
const SEARCH_KEY = import.meta.env.VITE_ALGOLIA_SEARCH_KEY as string;
const INDEX_NAME = import.meta.env.VITE_ALGOLIA_INDEX_NAME as string;

const HITS_PER_PAGE = 60;

// Tabs this helper can answer directly from Algolia. Every other real
// AdminFilter value (my_tasks, or any future addition) is deliberately
// NOT covered — searchTaskIdsByFilter returns null for those, and the
// caller falls back to today's existing subscribeToFilter behavior,
// unchanged. 'archived' is also NOT covered here — it's handled entirely
// by the separate useArchivedTasks hook in useTasks.ts, which this file
// has no interaction with at all (confirmed 19 Aug 2026 — see
// docs/PARKED.md for the real, separate State/Lead Source gap on that tab).
const TAB_CONDITION: Partial<Record<AdminFilter, string | null>> = {
  all:                    null,
  pending:                'status:pending AND NOT pipelineStage:dropped AND NOT pipelineStage:completed',
  in_progress:            'status:in_progress AND NOT pipelineStage:dropped AND NOT pipelineStage:completed',
  blocked:                'status:blocked AND NOT pipelineStage:dropped AND NOT pipelineStage:completed',
  completed:              'status:completed AND NOT pipelineStage:completed',
  // Sales Closed intentionally includes dropped-after-closed leads — no
  // pipelineStage condition here, matching taskMatchesActiveFilters's
  // own comment in TasksPage.tsx.
  sales_closed:           'saleClosed:true',
  converted:              'pipelineStage:completed',
  dropped:                'pipelineStage:dropped',
  pipeline_proposal:      'pipelineStage:proposal',
  pipeline_field_review:  'pipelineStage:field_review',
  pipeline_documents:     'pipelineStage:documents',
  pipeline_backend:       'pipelineStage:backend',
  needs_correction:       'needsCorrection:true',
  unassigned:             'unassignedProposal:true',
  unassigned_backend:     'unassignedBackend:true',
  follow_up:              'followUpDate > 0 AND stillInSurvey:true AND NOT status:completed',
  // Placeholder only — the real condition needs the current moment
  // computed fresh at call time, so it's built below in
  // searchTaskIdsByFilter itself rather than as a static string here.
  // This key's only job is to make `tab in TAB_CONDITION` true for 'overdue'.
  overdue:                null,
};

export interface SearchTaskIdsParams {
  tab: AdminFilter;
  stateFilter?: string;
  leadSourceFilter?: string;
  page: number; // 0-indexed
}

export interface SearchTaskIdsResult {
  objectIDs: string[];
  nbHits: number;
  nbPages: number;
}

export async function searchTaskIdsByFilter(
  params: SearchTaskIdsParams,
): Promise<SearchTaskIdsResult | null> {
  const { tab, stateFilter, leadSourceFilter, page } = params;

  if (!(tab in TAB_CONDITION)) {
    // Uncovered tab (my_tasks, archived, or any future addition not
    // yet wired up here) — caller must fall back to subscribeToFilter.
    return null;
  }

  const client = liteClient(APP_ID, SEARCH_KEY);

  const clauses: string[] = ['archived:false'];
  let tabCondition = TAB_CONDITION[tab];
  if (tab === 'overdue') {
    const nowMs = Date.now();
    tabCondition = `(status:pending OR status:in_progress OR status:blocked) AND stillInSurvey:true AND dueDate < ${nowMs}`;
  }
  if (tabCondition) clauses.push(tabCondition);
  if (stateFilter)      clauses.push(`state:"${stateFilter}"`);
  if (leadSourceFilter) clauses.push(`leadSource:"${leadSourceFilter}"`);

  const filters = clauses.join(' AND ');

  const { results } = await client.searchForHits<{ objectID: string }>({
    requests: [
      {
        indexName: INDEX_NAME,
        query: '',
        filters,
        hitsPerPage: HITS_PER_PAGE,
        page,
      },
    ],
  });

  const [result] = results;
  return {
    objectIDs: result.hits.map((hit) => hit.objectID),
    nbHits: result.nbHits ?? 0,
    nbPages: result.nbPages ?? 0,
  };
}
