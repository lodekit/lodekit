import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { kv } from "@lodekit/sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@lodekit/ui";

// The page's one live element: each visit bumps a counter in this app's own kv store.
const visit = createServerFn().handler(async () => kv.incr("visits"));

export const Route = createFileRoute("/")({
  loader: () => visit(),
  component: WelcomePage,
});

function WelcomePage() {
  const visits = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Welcome to Lodekit 👋</h1>
      <p className="text-muted-foreground">
        Lodekit is a local, self-hosted platform where you — working with an AI coding
        agent — build and run your own personal web tools.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Your Lodekit root</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Everything lives in one folder: <code>apps/</code> holds each app&apos;s source,
            <code> data/</code> holds its storage. Apps are plain TanStack Start projects —
            edit the source and the engine rebuilds them on save.
          </p>
          <p>
            Try the <strong>Greenhouse</strong> app next door: a small conservatory that
            shows what an app here can do — storage, files, scheduled work, logs.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Build with your agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Ask your coding agent for the tool you wish existed. It scaffolds an app in
            <code> apps/</code>, and the dashboard shows it building and running. Small,
            personal, yours.
          </p>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        You&apos;ve opened this page <span id="visit-count">{visits}</span>{" "}
        {visits === 1 ? "time" : "times"} — that number lives in this app&apos;s own
        key-value store.
      </p>
    </main>
  );
}
