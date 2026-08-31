import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, type ShellApp, type ShellLinkProps } from "@lodekit/ui";
import { isMarkStyle, type MarkStyle } from "@lodekit/ui/marks";

// The router's basepath (build.ts injects urlBase). AppShell speaks absolute
// hrefs; the adapter maps them onto SPA routes.
const PREFIX = "/_dashboard";
const toRoute = (href: string) => {
  const path = href.startsWith(PREFIX) ? href.slice(PREFIX.length) : href;
  return path === "" ? "/" : path;
};

// Dashboard-mode AppShell: chrome data from the existing react-query + SSE
// plumbing (both queries are invalidated by the SSE component), SPA
// navigation for /_dashboard hrefs. App links stay full-page inside AppShell.
export function DashboardShell({ children }: { children: ReactNode }) {
  const apps = useQuery<ShellApp[]>({
    queryKey: ["apps"],
    queryFn: async () => (await fetch("/api/apps")).json(),
  });
  const settings = useQuery<{ settings: { key: string; effective: unknown }[] }>({
    queryKey: ["settings", "_platform"],
    queryFn: async () => (await fetch("/api/settings")).json(),
  });
  const styleVal = settings.data?.settings.find((s) => s.key === "appearance.icon_style")?.effective;
  const iconStyle: MarkStyle = typeof styleVal === "string" && isMarkStyle(styleVal) ? styleVal : "b";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeHref = pathname.startsWith(PREFIX) ? pathname : PREFIX + pathname;

  return (
    <AppShell
      apps={apps.data}
      iconStyle={iconStyle}
      activeHref={activeHref}
      renderLink={({ href, ...rest }: ShellLinkProps) => <Link to={toRoute(href)} {...rest} />}
      navigate={(href) => void navigate({ to: toRoute(href) })}
    >
      {children}
    </AppShell>
  );
}
