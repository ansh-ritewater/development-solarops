/**
 * One-shot migration: backfill priorityScore and titleWords on every task doc.
 * Run once after deploying the code that writes these fields on new activity.
 *
 * Usage:
 *   npx ts-node scripts/migrateTasks.ts
 *
 * Requires a .env file (or environment variables) with:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as admin from 'firebase-admin';

const projectId   = process.env['FIREBASE_PROJECT_ID'];
const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'];
const privateKey  = process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing required env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

function computePriorityScore(
  pipelineStage: string | undefined | null,
  status: string,
): number {
  const stage = pipelineStage ?? 'survey';
  if (stage === 'backend')                              return 0;
  if (stage === 'field_review')                         return 1;
  if (stage === 'documents')                            return 2;
  if (stage === 'proposal')                             return 3;
  if (stage === 'survey' && status === 'in_progress')   return 4;
  if (stage === 'survey' && status === 'blocked')       return 5;
  if (stage === 'survey' && status === 'pending')       return 6;
  if (stage === 'survey' && status === 'completed')     return 7;
  if (stage === 'dropped')                              return 8;
  if (stage === 'completed')                            return 9;
  return 6;
}

function computeTitleWords(title: string): string[] {
  const lower = title.trim().toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 0);
  return [...new Set([lower, ...words])];
}

const CHUNK = 499;

async function run() {
  console.log('Fetching all task documents...');
  const snap = await db.collection('tasks').get();
  console.log(`Found ${snap.docs.length} tasks.`);

  let updated = 0;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + CHUNK);

    for (const docSnap of chunk) {
      const data          = docSnap.data();
      const pipelineStage = (data['pipelineStage'] as string | undefined) ?? 'survey';
      const status        = (data['status']        as string | undefined) ?? 'pending';
      const title         = (data['title']         as string | undefined) ?? '';

      batch.update(docSnap.ref, {
        priorityScore: computePriorityScore(pipelineStage, status),
        titleWords:    computeTitleWords(title),
      });
    }

    await batch.commit();
    updated += chunk.length;
    console.log(`  Committed ${updated} / ${snap.docs.length}`);
  }

  console.log(`Done. ${updated} tasks updated.`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
