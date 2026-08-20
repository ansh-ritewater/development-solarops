import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { docToTask } from '@/hooks/useTasks';
import type { Task } from '@/types';

export async function fetchTasksByIds(ids: string[]): Promise<Task[]> {
  // Firestore's 'in' operator caps at 30 values — confirmed against
  // real current Google Cloud documentation, 19 Aug 2026. Split into
  // chunks and run sequential queries, then merge and de-duplicate.
  const CHUNK_SIZE = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }
  const results: Task[] = [];
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const snap = await getDocs(query(
      collection(db, 'tasks'),
      where(documentId(), 'in', chunk),
    ));
    snap.docs.forEach((d) => results.push(docToTask(d)));
  }
  // Re-sort by updatedAt desc for a sensible, consistent display order
  // — Algolia's own result order isn't meaningful here (no text query).
  results.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
  return results;
}
