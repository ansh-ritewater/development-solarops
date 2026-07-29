/**
 * One-time migration: backfill priorityScore and titleWords on all existing tasks.
 * Uses the Firebase JS SDK (already installed) with email/password auth.
 *
 * Usage:
 *   node scripts/migrateTasksNode.mjs <email> <password>
 *
 * The script reads Firebase config from .env.local automatically.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Parse .env.local ──────────────────────────────────────────────────────────
function parseEnvFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

const env = parseEnvFile(resolve(ROOT, '.env.local'));

const firebaseConfig = {
  apiKey:            env['VITE_FIREBASE_API_KEY'],
  authDomain:        env['VITE_FIREBASE_AUTH_DOMAIN'],
  projectId:         env['VITE_FIREBASE_PROJECT_ID'],
  messagingSenderId: env['VITE_FIREBASE_MESSAGING_SENDER_ID'],
  appId:             env['VITE_FIREBASE_APP_ID'],
};

// ── Validate args ─────────────────────────────────────────────────────────────
const [, , email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/migrateTasksNode.mjs <email> <password>');
  process.exit(1);
}

// ── Scoring helpers (duplicated here — no TS imports in plain .mjs) ──────────
function computePriorityScore(pipelineStage, status) {
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

function computeTitleWords(title) {
  const lower = (title ?? '').trim().toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 0);
  return [...new Set([lower, ...words])];
}

// ── Main ──────────────────────────────────────────────────────────────────────
const CHUNK = 499;

async function run() {
  // Dynamic imports of the Firebase JS SDK from this project's node_modules
  const { initializeApp }             = await import('firebase/app');
  const { getAuth, signInWithEmailAndPassword, signOut } = await import('firebase/auth');
  const { getFirestore, collection, getDocs, writeBatch } = await import('firebase/firestore');

  console.log(`Project: ${firebaseConfig.projectId}`);
  console.log(`Signing in as: ${email}`);

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  // Sign in
  let userCred;
  try {
    userCred = await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error('Sign-in failed:', err.message);
    process.exit(1);
  }
  console.log(`Signed in as: ${userCred.user.email}`);

  // Fetch all tasks
  console.log('\nFetching all task documents...');
  const snap = await getDocs(collection(db, 'tasks'));
  console.log(`Found ${snap.docs.length} tasks.`);

  if (snap.docs.length === 0) {
    console.log('Nothing to migrate.');
    await signOut(auth);
    process.exit(0);
  }

  // Dry-run summary before committing
  let alreadyHasScore = 0;
  let missingScore    = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data['priorityScore'] !== undefined && data['titleWords'] !== undefined) {
      alreadyHasScore++;
    } else {
      missingScore++;
    }
  }
  console.log(`  Already migrated: ${alreadyHasScore}`);
  console.log(`  Need migration:   ${missingScore}`);
  console.log('');

  // Batch-write in chunks of 499
  let updated = 0;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    const chunk = snap.docs.slice(i, i + CHUNK);

    for (const docSnap of chunk) {
      const data          = docSnap.data();
      const pipelineStage = data['pipelineStage'] ?? 'survey';
      const status        = data['status']        ?? 'pending';
      const title         = data['title']         ?? '';

      batch.update(docSnap.ref, {
        priorityScore: computePriorityScore(pipelineStage, status),
        titleWords:    computeTitleWords(title),
      });
    }

    await batch.commit();
    updated += chunk.length;
    console.log(`  Committed ${updated} / ${snap.docs.length}`);
  }

  console.log(`\nDone. ${updated} tasks updated.`);

  await signOut(auth);
  console.log('Signed out.');
  process.exit(0);
}

run().catch((err) => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
