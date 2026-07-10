import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Button, Card, CardContent, Input, Kbd, Spinner } from "../src";

// Interim smoke after the base-nova regeneration — Task 3 of the migration
// plan rebuilds full-coverage SSR smoke over every barrel export.
describe("SSR smoke (interim)", () => {
  it("core components render server-side", () => {
    expect(typeof window).toBe("undefined");
    const html = renderToString(
      <Card>
        <CardContent>
          <Button>Button Marker</Button>
          <Input placeholder="Input Marker" />
          <Kbd>⌘K</Kbd>
          <Spinner />
        </CardContent>
      </Card>
    );
    expect(html).toContain("Button Marker");
    expect(html).toContain("Input Marker");
  });
});
