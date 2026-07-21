import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  outputDir: "/tmp/opencode/test-results",
  use: {
    baseURL: "http://127.0.0.1:8000",
    screenshot: "only-on-failure",
    permissions: ["microphone"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
  },
  webServer: {
    command: "bun run dev",
    url: "http://127.0.0.1:8000",
    reuseExistingServer: true,
  },
});
