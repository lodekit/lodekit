// packages/runtime/dashboard/src/routes/tasks.tsx
import { createFileRoute } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { EmptyStub } from "../components/empty-stub";

export const Route = createFileRoute("/tasks")({
  component: () => <EmptyStub icon={ListChecks} title="Tasks" />,
});
