import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge, Kicker, Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, Skeleton, cn } from "@lodekit/ui";
import { Database, Folder, KeyRound, LayoutDashboard, Table2, HardDrive, type LucideIcon } from "@lodekit/ui/icons";
import { fetchApps, fetchSchema } from "../../lib/data-api";

const itemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground";
const activeClass = "bg-accent text-accent-foreground";

function NavItem({ to, params, icon: Icon, label, exact, badge }: {
  to: string; params: Record<string, string>; icon: LucideIcon; label: string; exact?: boolean; badge?: string;
}) {
  return (
    <Link to={to} params={params} className={itemClass} activeProps={{ className: cn(itemClass, activeClass) }} activeOptions={{ exact: exact ?? false }}>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {badge && <Badge variant="secondary" className="ml-auto">{badge}</Badge>}
    </Link>
  );
}

export function ExplorerSidebar() {
  const { appId } = useParams({ strict: false }) as { appId?: string };
  const navigate = useNavigate();
  const apps = useQuery({ queryKey: ["apps"], queryFn: fetchApps });
  const schema = useQuery({
    queryKey: ["data", appId, "schema"],
    queryFn: () => fetchSchema(appId!),
    enabled: !!appId,
  });

  return (
    <aside className="rounded-xl border bg-card p-3 md:sticky md:top-24 md:w-56 md:shrink-0 md:self-start">
      {apps.data ? (
        <Select
          value={appId ?? ""}
          onValueChange={(v) => { if (v) void navigate({ to: "/data/$appId", params: { appId: v } }); }}
          // items: Base UI resolves the closed SelectValue through it — without it the
          // trigger shows the raw stored value ("greenhouse") instead of the label.
          items={apps.data.map((a) => ({ value: a.appId, label: `${a.icon ? `${a.icon} ` : ""}${a.name}` }))}
        >
          <SelectTrigger className="h-10 w-full font-medium">
            <SelectValue placeholder="Select an app" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {apps.data.map((a) => (
                <SelectItem key={a.appId} value={a.appId}>{a.icon ? `${a.icon} ` : ""}{a.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <Skeleton className="h-10 w-full" />
      )}
      {appId && (
        <nav className="mt-4 flex flex-col gap-0.5">
          <NavItem to="/data/$appId" params={{ appId }} icon={LayoutDashboard} label="Overview" exact />
          <div className="mt-3 mb-1 flex items-center gap-2 px-2">
            <Database className="size-3.5" aria-hidden="true" /> <Kicker className="text-muted-foreground/70">Tables</Kicker>
          </div>
          {schema.isLoading && <Skeleton className="mx-2 h-16" />}
          {schema.data?.tables.length === 0 && <p className="text-muted-foreground px-2 py-1 text-xs">No tables yet.</p>}
          {schema.data?.tables.map((t) => (
            <Link
              key={t.name}
              to="/data/$appId/tables/$table"
              params={{ appId, table: t.name }}
              className={cn(itemClass, "pl-4")}
              activeProps={{ className: cn(itemClass, "pl-4", activeClass) }}
            >
              <Table2 className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate font-mono text-xs">{t.name}</span>
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-0.5">
            <NavItem to="/data/$appId/kv" params={{ appId }} icon={KeyRound} label="Key-value" />
            <NavItem to="/data/$appId/files" params={{ appId }} icon={Folder} label="Files" />
            <NavItem to="/data/$appId/storage" params={{ appId }} icon={HardDrive} label="Storage" badge="Soon" />
          </div>
        </nav>
      )}
    </aside>
  );
}
