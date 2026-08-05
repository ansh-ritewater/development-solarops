import type { Task } from '@/types';

/**
 * True only when a task was sent back to Survey via Full Restart
 * (an admin override with no live correction tracking) and genuinely
 * needs to be resurveyed — as opposed to a brand-new task that has
 * simply never left Survey, or a live Quick Correction (which already
 * has its own correctionReturnTo-based UI and must never overlap
 * with this flag).
 *
 * Reads only existing fields. Never writes anything.
 */
export function needsResurvey(task: Pick<Task, 'pipelineStage' | 'correctionReturnTo' | 'stageHistory'>): boolean {
  if (!task.pipelineStage || task.pipelineStage !== 'survey') return false;
  if (task.correctionReturnTo) return false; // live Quick Correction — its own UI already handles this
  const history = task.stageHistory ?? [];
  if (history.length === 0) return false;
  const last = history[history.length - 1];
  return last.actorRole === 'admin_override' && last.toStage === 'survey';
}
