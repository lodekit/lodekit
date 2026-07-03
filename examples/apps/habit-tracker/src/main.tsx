import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { kv } from "@lodekit/sdk";
import { router } from "./router";
import "./index.css";

const queryClient = new QueryClient();
// Canonical live-data pattern: store change events invalidate queries; Query refetches.
kv.watch("", () => void queryClient.invalidateQueries({ queryKey: ["kv"] }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
