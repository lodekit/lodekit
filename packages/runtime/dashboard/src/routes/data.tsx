// packages/runtime/dashboard/src/routes/data.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { EmptyStub } from "../components/empty-stub";

export const Route = createFileRoute("/data")({
  component: () => <EmptyStub icon={Database} title="Data" />,
});
