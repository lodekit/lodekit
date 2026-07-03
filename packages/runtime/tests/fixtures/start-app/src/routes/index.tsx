import { createFileRoute } from "@tanstack/react-router";
import { ping } from "../fns";

export const Route = createFileRoute("/")({
  loader: () => ping({ data: { echo: "loader" } }),
  component: () => {
    const data = Route.useLoaderData();
    return (
      <main>
        <h1>start fixture ok</h1>
        <p id="ssr-proof">{data.echo}:{data.pid}</p>
      </main>
    );
  },
});
