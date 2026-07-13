import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Line, LineChart } from "recharts";

import { ChartContainer, type ChartConfig } from "../src";

// SSR smoke for the chart port: ChartContainer must render its wrapper and
// emit the per-series CSS variables (light + dark) from the config.
describe("chart", () => {
  it("renders config-driven CSS variables", () => {
    const config = {
      temp: { label: "Temperature", color: "var(--chart-1)" },
      themed: { label: "Themed", theme: { light: "#111111", dark: "#eeeeee" } },
    } satisfies ChartConfig;

    const html = renderToString(
      <ChartContainer config={config}>
        <LineChart data={[{ temp: 1, themed: 2 }]}>
          <Line dataKey="temp" />
        </LineChart>
      </ChartContainer>
    );

    expect(html).toContain('data-slot="chart"');
    expect(html).toContain("--color-temp: var(--chart-1);");
    expect(html).toContain("--color-themed: #111111;");
    expect(html).toContain("--color-themed: #eeeeee;");
  });
});
