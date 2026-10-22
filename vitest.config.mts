import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // Integration suites share one PostgreSQL test database.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/pact_test",
      PACT_AI_MODE: "baseline",
      APP_ORIGIN: "http://localhost:3000",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
    },
  },
});
