import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function parrotE2eMockApi(): Plugin {
  return {
    name: "parrot-e2e-mock-api",
    configureServer(server) {
      if (process.env.PARROT_E2E_MOCK_API !== "1") return;

      server.middlewares.use("/api/evaluate-speech", (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }

        request.resume();
        request.on("end", () => {
          const transcript =
            process.env.PARROT_E2E_TRANSCRIPT ?? "Hi, Bella! How are you?";

          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Type", "application/json");
          response.setHeader("X-Parrot-Mock-Api", "true");
          response.end(
            JSON.stringify({
              transcript,
              similarity: 1,
              passed: true,
              feedbackText: "太棒了！我们继续下一句。",
              retryAllowed: false,
            })
          );
        });
        request.on("error", () => {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "mock_request_failed" }));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), parrotE2eMockApi()],
  build: {
    outDir: "dist",
  },
});
