import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { algoliasearch } from "algoliasearch";

const algoliaWriteKey = defineSecret("ALGOLIA_WRITE_KEY");
const INDEX_NAME = "tasks_dev";

// Deliberately minimal — only fields ever needed for filtering/search.
// NEVER sync photos, remarks, or the embedded survey template snapshot.
// See docs/BACKEND_ARCHITECTURE.md for the full reasoning.
//
// NOTE: the real Task type (src/types/index.ts) has no engineerUid/
// engineerName fields — the assigned field engineer is stored as
// assignedTo (uid) / assignedToName. Using the real field names here.
function toAlgoliaRecord(id: string, data: Record<string, unknown>) {
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
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    dueDate: data.dueDate ?? null,
  };
}

export const syncTaskToAlgolia = onDocumentWritten(
  {
    document: "tasks/{taskId}",
    secrets: [algoliaWriteKey],
    region: "asia-south1", // must match Firestore's actual location, confirmed via `firebase firestore:databases:get` — us-central1 caused a cross-region Eventarc trigger failure
  },
  async (event) => {
    const taskId = event.params.taskId;
    const client = algoliasearch(
      "PUIHSC9EQ7", // Application ID — not sensitive, safe to hardcode
      algoliaWriteKey.value()
    );

    const afterExists = event.data?.after?.exists;

    if (!afterExists) {
      // Task was deleted — remove it from the search index too.
      await client.deleteObject({ indexName: INDEX_NAME, objectID: taskId });
      console.log(`[syncToAlgolia] Deleted ${taskId} from index (doc removed)`);
      return;
    }

    const data = event.data!.after!.data()!;
    const record = toAlgoliaRecord(taskId, data);
    await client.saveObject({ indexName: INDEX_NAME, body: record });
    console.log(`[syncToAlgolia] Synced ${taskId} to index`);
  }
);
