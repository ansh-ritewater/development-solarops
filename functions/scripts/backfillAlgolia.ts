import * as admin from "firebase-admin";
import { algoliasearch } from "algoliasearch";

// ONE-TIME SCRIPT — run manually, never deployed, never triggered
// automatically. Backfills every existing task into Algolia, using
// the exact same minimal field mapping as syncToAlgolia.ts, so the
// two stay perfectly consistent with each other.
//
// Usage: npx ts-node scripts/backfillAlgolia.ts
//
// Requires: the same ALGOLIA_WRITE_KEY value, passed via an
// environment variable at run time (never hardcoded, never committed):
//   ALGOLIA_WRITE_KEY=<value> npx ts-node scripts/backfillAlgolia.ts

admin.initializeApp();
const db = admin.firestore();

const APP_ID = "PUIHSC9EQ7";
const INDEX_NAME = "tasks_dev";
const BATCH_SIZE = 500; // Algolia's own recommended batch size

// Mirrors toAlgoliaRecord in ../src/syncToAlgolia.ts exactly — if that
// function's field list ever changes, update this one to match.
// (assignedTo/assignedToName are the real Task fields for the assigned
// field engineer — src/types/index.ts has no engineerUid/engineerName.)
function toAlgoliaRecord(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    objectID: id,
    title: data.title ?? "",
    taskNum: data.taskNum ?? null,
    state: data.state ?? null,
    district: data.district ?? null,
    leadSource: data.leadSource ?? null,
    assignedTo: data.assignedTo ?? null,
    assignedToName: data.assignedToName ?? null,
    pipelineStage: data.pipelineStage ?? null,
    status: data.status ?? null,
    saleClosed: data.saleClosed ?? false,
    archived: data.archived ?? false,
    needsCorrection: !!data.correctionReturnTo,
    unassignedProposal: !data.proposalAssignedTo,
    unassignedBackend: !data.backendAssignedTo,
    // A direct translation of isActiveFollowUp/isOverdue's own shared
    // condition (TasksPage.tsx) — safe to precompute since it only
    // changes on an actual write to the task.
    stillInSurvey: !data.pipelineStage || data.pipelineStage === "survey",
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    // Algolia's numeric filters need a plain Unix-ms number, not a
    // Firestore Timestamp object — data here is the raw admin-SDK
    // document, unconverted.
    dueDate: (data.dueDate as FirebaseFirestore.Timestamp | null)?.toMillis() ?? null,
    followUpDate: (data.followUpDate as FirebaseFirestore.Timestamp | null)?.toMillis() ?? null,
  };
}

async function main() {
  const writeKey = process.env.ALGOLIA_WRITE_KEY;
  if (!writeKey) {
    console.error("ALGOLIA_WRITE_KEY environment variable not set. Aborting — will not run without it.");
    process.exit(1);
  }

  const client = algoliasearch(APP_ID, writeKey);

  console.log("Reading all tasks from Firestore...");
  const snapshot = await db.collection("tasks").get();
  console.log(`Found ${snapshot.size} tasks.`);

  const records = snapshot.docs.map((doc) => toAlgoliaRecord(doc.id, doc.data()));

  console.log(`Uploading ${records.length} records to Algolia index "${INDEX_NAME}" in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    await client.saveObjects({ indexName: INDEX_NAME, objects: chunk });
    console.log(`  Uploaded ${Math.min(i + BATCH_SIZE, records.length)} / ${records.length}`);
  }

  console.log("Backfill complete.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
