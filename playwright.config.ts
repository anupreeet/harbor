import { defineConfig } from "@playwright/test";

// End-to-end: the real UI, server actions and database, on a separate dev server and
// database. No Tavus minutes: the test stops at the camera check, before a call is created.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3200",
    viewport: { width: 1440, height: 1000 },
    permissions: ["camera", "microphone"],
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  },
  webServer: {
    command: "npx next dev --port 3200",
    url: "http://localhost:3200/",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { PGLITE_DIR: ".data/pglite-e2e", DATABASE_URL: "", INVITE_CODE: "", ADVISOR_EMAILS: "" },
  },
});
