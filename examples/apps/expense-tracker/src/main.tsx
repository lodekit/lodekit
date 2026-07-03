import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { kv } from "@lodekit/sdk";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();
// Canonical live-data pattern: store change events invalidate queries; Query refetches.
kv.watch("", () => void queryClient.invalidateQueries({ queryKey: ["kv"] }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
