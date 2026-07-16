// packages/runtime/dashboard/src/routes/themes.tsx
import { createFileRoute } from "@tanstack/react-router";
import { Palette } from "@lodekit/ui/icons";
import { EmptyStub } from "../components/empty-stub";

export const Route = createFileRoute("/themes")({
  component: () => <EmptyStub icon={Palette} title="Themes" />,
});
