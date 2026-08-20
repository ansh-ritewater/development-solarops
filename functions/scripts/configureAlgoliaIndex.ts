import { algoliasearch } from "algoliasearch";

// ONE-TIME SCRIPT — configures tasks_dev's index settings so it can
// actually be filtered on. Confirmed 19 Aug 2026 via the real Algolia
// dashboard that "Attributes for faceting" was empty — this is the
// missing piece that made every real filter attempt fail silently.
//
// Usage: ALGOLIA_WRITE_KEY=<value> npx ts-node scripts/configureAlgoliaIndex.ts

const APP_ID = "PUIHSC9EQ7";
const INDEX_NAME = "tasks_dev";

async function main() {
  const writeKey = process.env.ALGOLIA_WRITE_KEY;
  if (!writeKey) {
    console.error("ALGOLIA_WRITE_KEY environment variable not set. Aborting.");
    process.exit(1);
  }

  const client = algoliasearch(APP_ID, writeKey);

  console.log(`Setting attributesForFaceting on "${INDEX_NAME}"...`);
  await client.setSettings({
    indexName: INDEX_NAME,
    indexSettings: {
      attributesForFaceting: [
        "state",
        "leadSource",
        "status",
        "pipelineStage",
        "saleClosed",
        "archived",
      ],
    },
  });

  console.log("Done. Verifying...");
  const settings = await client.getSettings({ indexName: INDEX_NAME });
  console.log("Current attributesForFaceting:", settings.attributesForFaceting);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
