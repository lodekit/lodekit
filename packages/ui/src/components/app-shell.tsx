"use client"

import * as React from "react"

import { Bell, ChevronDown, ChevronUp, LayoutGrid, Search, Settings } from "../icons"
import { isMarkStyle, type MarkStyle } from "../marks"
import { cn } from "../lib/utils"
import { Button } from "./button"
import {
  Command,
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "./command"
import { Kbd } from "./kbd"
import { Mark } from "./mark"
import { DASHBOARD_HOME_HREF, SERVICES, SETTINGS_HREF } from "./shell-nav"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarTrigger, useSidebar,
} from "./sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

// The platform chrome (app-shell spec): header + icon rail on desktop, the
// Sidebar primitive's canonical sheet on small screens. Rendered by the
// dashboard (app mode absent) and by apps from their own __root.tsx, where it
// inherits the app's designated theme via the document-level theme link.

export type ShellApp = { appId: string; name: string; icon?: string }

// Dashboard-internal links (services, settings, home) go through renderLink so
// the dashboard can keep SPA navigation; the default is a plain anchor, which
// is correct inside app documents. App links are always plain anchors — apps
// are separate documents from every surface.
export type ShellLinkProps = React.ComponentPropsWithoutRef<"a"> & { href: string }
export type RenderLink = (props: ShellLinkProps) => React.ReactElement

export type AppShellProps = {
  /** Present → app mode (identity swap, active rail item); absent → dashboard mode. */
  app?: ShellApp
  /** Live data override; absent → fetched once from /_ui/shell.json. */
  apps?: ShellApp[]
  /** Live mark-style override; absent → from /_ui/shell.json. */
  iconStyle?: MarkStyle
  renderLink?: RenderLink
  /** Programmatic navigation for command-bar selections of dashboard pages. */
  navigate?: (href: string) => void
  /** Current pathname; marks the active service/settings item (dashboard). */
  activeHref?: string
  children: React.ReactNode
}

const SERVICES_EXPANDED_KEY = "lodekit:shell:services-expanded"
const APP_ICON_FALLBACK = "📦"

const wordmarkClass = "text-[1.2rem] leading-none font-bold uppercase tracking-[0.22em]"
const wordmarkStyle: React.CSSProperties = { fontFamily: "var(--lk-font-wordmark)" }

const defaultRenderLink: RenderLink = (props) => <a {...props} />

const appIcon = (app: ShellApp) => (app.icon && typeof app.icon === "string" ? app.icon : APP_ICON_FALLBACK)

export function AppShell({
  app,
  apps: appsProp,
  iconStyle: iconStyleProp,
  renderLink,
  navigate,
  activeHref,
  children,
}: AppShellProps) {
  // Chrome data: fetch-once fallback for surfaces (apps) that pass no data
  // props at all. A consumer that supplies either prop owns the data — the
  // dashboard passes both from its live queries, and its `apps` may be
  // momentarily undefined while loading (rendered as the rail dots) without
  // triggering a redundant shell.json fetch.
  const needsFetch = appsProp === undefined && iconStyleProp === undefined
  const [fetched, setFetched] = React.useState<{ apps?: ShellApp[]; iconStyle?: string } | null>(null)
  React.useEffect(() => {
    if (!needsFetch) return
    let cancelled = false
    void fetch("/_ui/shell.json")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setFetched(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [needsFetch])

  const apps = appsProp ?? (Array.isArray(fetched?.apps) ? (fetched.apps as ShellApp[]) : undefined)
  const fetchedStyle = fetched?.iconStyle
  const iconStyle =
    iconStyleProp ?? (typeof fetchedStyle === "string" && isMarkStyle(fetchedStyle) ? fetchedStyle : "b")

  const dashLink = renderLink ?? defaultRenderLink
  const go = navigate ?? ((href: string) => window.location.assign(href))

  const [commandOpen, setCommandOpen] = React.useState(false)
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <SidebarProvider
      // Desktop is pinned to the collapsed icon rail — never expandable, so the
      // primitive's ⌘B / cookie / trigger affordances are inert on md+. Mobile
      // keeps the canonical sheet via openMobile.
      open={false}
      onOpenChange={() => {}}
      style={{ "--sidebar-width-icon": "4rem" } as React.CSSProperties}
    >
      <Sidebar collapsible="icon">
        <RailHeader iconStyle={iconStyle} dashLink={dashLink} />
        <RailApps apps={apps} currentAppId={app?.appId} />
        <RailFooter dashLink={dashLink} activeHref={activeHref} />
      </Sidebar>
      <SidebarInset className="h-svh min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b bg-sidebar px-3 text-sidebar-foreground md:px-4">
          <SidebarTrigger className="md:hidden" aria-label="Open navigation" />
          {app ? (
            <a href={`/${app.appId}/`} className="mr-1 hidden items-center gap-2 md:flex">
              <span className="text-base leading-none" aria-hidden="true">
                {appIcon(app)}
              </span>
              <span className="font-display text-base font-medium">{app.name}</span>
            </a>
          ) : (
            dashLink({
              href: DASHBOARD_HOME_HREF,
              "aria-label": "Lodekit home",
              className: "mr-1 hidden items-center text-sidebar-foreground opacity-80 md:flex",
              children: (
                <span className={wordmarkClass} style={wordmarkStyle}>
                  Lodekit
                </span>
              ),
            })
          )}
          <div className="flex-1" />
          {/* Desktop: input-lookalike trigger, centered by the flex spacers. */}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="hidden h-8 w-56 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent md:inline-flex"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Search…</span>
            <Kbd>⌘K</Kbd>
          </button>
          <div className="flex-1" />
          {/* Narrow: bare icon, right-aligned next to the bell. */}
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setCommandOpen(true)}>
            <Search className="size-4" />
          </Button>
          {/* Inert by design (app-shell spec: no notification feature yet). */}
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SidebarInset>
      <ShellCommandDialog open={commandOpen} onOpenChange={setCommandOpen} apps={apps} go={go} />
    </SidebarProvider>
  )
}

// Badge cell on desktop (h-14, matching the header row); the full lockup in
// the mobile sheet — the wordmark span only hides in the collapsed icon rail.
function RailHeader({ iconStyle, dashLink }: { iconStyle: MarkStyle; dashLink: RenderLink }) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarHeader className="h-14 shrink-0 justify-center border-b border-sidebar-border">
      {dashLink({
        href: DASHBOARD_HOME_HREF,
        "aria-label": "Lodekit home",
        className:
          "flex items-center gap-[0.6em] px-2 text-sidebar-foreground opacity-80 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
        onClick: () => setOpenMobile(false),
        children: (
          <>
            <Mark style={iconStyle} className="size-6 shrink-0" />
            <span className={cn(wordmarkClass, "group-data-[collapsible=icon]:hidden")} style={wordmarkStyle}>
              Lodekit
            </span>
          </>
        ),
      })}
    </SidebarHeader>
  )
}

function RailDots(props: React.ComponentProps<"div">) {
  return (
    <div
      // data-slot gets overwritten by base-ui's tooltip-trigger merge in the
      // empty state — the custom attribute is the stable hook.
      data-shell-dots=""
      data-slot="shell-rail-dots"
      {...props}
      className={cn("flex flex-col items-center gap-1.5 py-2", props.className)}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 rounded-full bg-sidebar-foreground/30" />
      ))}
    </div>
  )
}

function RailApps({ apps, currentAppId }: { apps?: ShellApp[]; currentAppId?: string }) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          {apps === undefined ? (
            // Loading: same geometry as empty, no affordance yet.
            <RailDots />
          ) : apps.length === 0 ? (
            isMobile ? (
              <p className="px-2 py-1 text-sm text-sidebar-foreground/70">Your apps live here.</p>
            ) : (
              <Tooltip>
                <TooltipTrigger render={<RailDots />} />
                <TooltipContent side="right" align="center">
                  Your apps live here.
                </TooltipContent>
              </Tooltip>
            )
          ) : (
            <SidebarMenu aria-label="Apps" className="gap-1 group-data-[collapsible=icon]:items-center">
              {apps.map((a) => (
                <SidebarMenuItem key={a.appId}>
                  <SidebarMenuButton
                    tooltip={a.name}
                    isActive={a.appId === currentAppId}
                    render={<a href={`/${a.appId}/`} onClick={() => setOpenMobile(false)} />}
                  >
                    <span className="flex size-4 items-center justify-center text-base leading-none" aria-hidden="true">
                      {appIcon(a)}
                    </span>
                    <span>{a.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          )}
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  )
}

// Bottom cluster: chevron + Services (inline expansion, persisted) + Settings.
// The sheet always shows the services expanded under a group label; the
// persisted toggle drives the desktop rail only.
function RailFooter({ dashLink, activeHref }: { dashLink: RenderLink; activeHref?: string }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const [expanded, setExpanded] = React.useState(false)
  React.useEffect(() => {
    // Applied post-mount so SSR markup is deterministic (spec §4).
    try {
      if (localStorage.getItem(SERVICES_EXPANDED_KEY) === "1") setExpanded(true)
    } catch {
      /* storage unavailable — session-only state */
    }
  }, [])
  const toggle = () =>
    setExpanded((v) => {
      const next = !v
      try {
        if (next) localStorage.setItem(SERVICES_EXPANDED_KEY, "1")
        else localStorage.removeItem(SERVICES_EXPANDED_KEY)
      } catch {
        /* storage unavailable — session-only state */
      }
      return next
    })

  const isActive = (href: string) =>
    activeHref !== undefined && (activeHref === href || activeHref.startsWith(`${href}/`))
  const showServices = expanded || isMobile

  return (
    <SidebarFooter className="gap-1 pb-3">
      {!isMobile && (
        <button
          type="button"
          aria-label={expanded ? "Collapse services" : "Expand services"}
          aria-expanded={expanded}
          onClick={toggle}
          data-slot="shell-services-chevron"
          className="flex h-5 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      )}
      {showServices && (
        <>
          <SidebarGroupLabel>Services</SidebarGroupLabel>
          <SidebarMenu aria-label="Services" className="gap-1 group-data-[collapsible=icon]:items-center">
            {SERVICES.map((s) => (
              <SidebarMenuItem key={s.label}>
                <SidebarMenuButton
                  tooltip={s.label}
                  isActive={isActive(s.href)}
                  render={dashLink({ href: s.href, onClick: () => setOpenMobile(false) })}
                >
                  <s.icon className="size-4" aria-hidden="true" />
                  <span>{s.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </>
      )}
      {!isMobile && (
        <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Services"
              aria-expanded={expanded}
              onClick={toggle}
              data-slot="shell-services-toggle"
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
              <span>Services</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      )}
      <SidebarMenu className={cn("gap-1 group-data-[collapsible=icon]:items-center", isMobile && "mt-4")}>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Settings"
            isActive={isActive(SETTINGS_HREF)}
            render={dashLink({ href: SETTINGS_HREF, onClick: () => setOpenMobile(false) })}
          >
            <Settings className="size-4" aria-hidden="true" />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  )
}

function ShellCommandDialog({
  open,
  onOpenChange,
  apps,
  go,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  apps?: ShellApp[]
  go: (href: string) => void
}) {
  const close = () => onOpenChange(false)
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* base-nova's CommandDialog (unlike the old Radix flavor's) does not
          provide the cmdk root; without <Command> the parts crash on open
          (undefined store.subscribe) — see the command-dialog-mount test. */}
      <Command>
        <CommandInput placeholder="Search apps and pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {(apps ?? []).length > 0 && (
            <CommandGroup heading="Apps">
              {(apps ?? []).map((a) => (
                <CommandItem
                  key={a.appId}
                  onSelect={() => {
                    close()
                    // Apps are separate documents from every surface.
                    window.location.assign(`/${a.appId}/`)
                  }}
                >
                  <span aria-hidden="true">{appIcon(a)}</span> {a.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Services">
            {SERVICES.map((s) => (
              <CommandItem
                key={s.label}
                onSelect={() => {
                  close()
                  go(s.href)
                }}
              >
                <s.icon className="size-4" aria-hidden="true" /> {s.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup>
            <CommandItem
              onSelect={() => {
                close()
                go(SETTINGS_HREF)
              }}
            >
              <Settings className="size-4" aria-hidden="true" /> Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
