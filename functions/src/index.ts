import { onRequest } from "firebase-functions/v2/https";

// TEMPORARY TEST FUNCTION — proves the Cloud Functions pipeline
// works end-to-end before any real logic is built on top of it.
// Safe to remove once Phase 1's real functions are built and
// deployed successfully — see docs/BACKEND_ARCHITECTURE.md.
export const pingBackend = onRequest((req, res) => {
  res.json({
    status: "ok",
    message: "SolarOps backend is alive",
    timestamp: new Date().toISOString(),
  });
});

export * from "./syncToAlgolia";
