// packages/runtime/dashboard/src/components/nav.ts
import { Database, KeyRound, ListChecks, Palette, ScrollText, Zap, type LucideIcon } from "lucide-react";

// The services menu / command-bar page list (UI revamp spec §2). `to` navigates
// inside the SPA; `href` is a full-page navigation (Themes is the static
// Storybook build at /_ui/ — it cannot render inside the router).
export type ServiceEntry = { label: string; icon: LucideIcon } & ({ to: string; href?: never } | { href: string; to?: never });

export const SERVICES: ServiceEntry[] = [
  { label: "Data", icon: Database, to: "/data" },
  { label: "Tasks", icon: ListChecks, to: "/tasks" },
  { label: "Events", icon: Zap, to: "/events" },
  { label: "Secrets", icon: KeyRound, to: "/secrets" },
  { label: "Logs", icon: ScrollText, to: "/logs" },
  { label: "Themes", icon: Palette, href: "/_ui/" },
];
