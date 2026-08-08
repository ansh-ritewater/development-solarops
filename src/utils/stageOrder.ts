import type { PipelineStage } from '@/types';

export const STAGE_ORDER: PipelineStage[] = [
  'survey', 'proposal', 'field_review', 'documents', 'backend', 'completed',
];

export function stageIndex(stage: PipelineStage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * True only when `to` is a genuine EARLIER stage than `from`, within
 * the normal sequence. False for 'dropped' on either side (not a real
 * sequence position), false for a forward move, false for a
 * lateral/no-op move. Used to warn when Quick Correction is being
 * used for something other than its intended backward-only purpose.
 */
export function isBackwardMove(from: PipelineStage, to: PipelineStage): boolean {
  const fromIdx = stageIndex(from);
  const toIdx   = stageIndex(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx < fromIdx;
}
