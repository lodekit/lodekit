import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@lodekit/ui";
import { parseTheme } from "../lib/theme-css";
import { fetchThemeCss, type ThemesIndex } from "../lib/themes-api";

// Presentational library card: name, vendored badge, a 5-swatch strip and a
// light/dark mini-preview parsed from the theme's own CSS. Mutations live in the
// route — this card only renders and reports clicks (onOpen) and hosts the
// actions menu passed in via `actions`.

// The swatch strip: five roles from the parsed light palette, spec §4.
const SWATCH_TOKENS = ["primary", "background", "secondary", "accent", "destructive"] as const;

export function ThemeCard({
  theme,
  assignments,
  onOpen,
  actions,
}: {
  theme: ThemesIndex["themes"][number];
  assignments: string[]; // "Global" and/or app ids this theme is assigned to
  onOpen: () => void;
  actions: ReactNode;
}) {
  const cssQ = useQuery({ queryKey: ["theme-css", theme.name], queryFn: () => fetchThemeCss(theme.name) });
  const model = cssQ.data ? parseTheme(cssQ.data) : null;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="relative h-full cursor-pointer transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="truncate">{theme.name}</CardTitle>
          {/* Menu sits above the card's click target. */}
          <div className="relative z-10 -mt-1 -mr-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {actions}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
          {theme.vendored && <Badge variant="secondary">vendored</Badge>}
          {assignments.map((a) => (
            <Badge key={a} variant="outline">{a}</Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cssQ.isLoading ? (
          <Skeleton className="h-14" />
        ) : model?.raw ? (
          // Degraded hand-authored theme: no parsed palette — a neutral placeholder.
          <div className="flex h-9 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            custom CSS
          </div>
        ) : model ? (
          <>
            <div className="flex gap-1.5">
              {SWATCH_TOKENS.map((tok) => (
                <div
                  key={tok}
                  title={tok}
                  className="h-7 flex-1 rounded-md border"
                  style={{ backgroundColor: model.light[tok] }}
                />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["light", "dark"] as const).map((mode) => {
                const map = mode === "light" ? model.light : model.dark;
                return (
                  <div key={mode} className="flex items-center gap-2 rounded-md border p-2" style={{ backgroundColor: map.background }}>
                    <span className="text-[0.65rem] font-medium" style={{ color: map.foreground }}>{mode}</span>
                    <span className="ml-auto flex gap-1">
                      <span className="size-3 rounded-full border" style={{ backgroundColor: map.foreground }} />
                      <span className="size-3 rounded-full border" style={{ backgroundColor: map.primary }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
