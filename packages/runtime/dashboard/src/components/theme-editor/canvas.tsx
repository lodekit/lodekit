import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type ChartConfig,
} from "@lodekit/ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
} from "recharts";
import {
  Cpu,
  Database,
  FileText,
  Folder,
  HardDrive,
  Info,
  KeyRound,
  LayoutDashboard,
  Palette,
  PlusCircle,
  Search,
  Settings,
  Zap,
} from "@lodekit/ui/icons";

// Self-contained sample composition for the theme editor's preview pane. This
// file must import only from @lodekit/ui, @lodekit/ui/icons and React — no
// fetches, no router, no dashboard lib — so it can be lifted wholesale onto a
// future ui.lodekit.com. All data below is static/inline by design.

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Data", icon: Database },
  { label: "Files", icon: FileText },
  { label: "Storage", icon: HardDrive },
  { label: "Settings", icon: Settings },
];

const iconRow = [
  LayoutDashboard,
  Search,
  Settings,
  Database,
  FileText,
  Folder,
  Cpu,
  HardDrive,
  Palette,
  Zap,
  Info,
  KeyRound,
];

const tableRows = [
  { name: "invoice-014.pdf", type: "PDF", size: "212 KB", updated: "2h ago" },
  { name: "sales-q2.csv", type: "CSV", size: "1.4 MB", updated: "5h ago" },
  { name: "roadmap.md", type: "Markdown", size: "8 KB", updated: "1d ago" },
  { name: "avatar.png", type: "Image", size: "64 KB", updated: "3d ago" },
  { name: "backup.zip", type: "Archive", size: "18.2 MB", updated: "1w ago" },
];

const lineData = [
  { month: "Jan", visits: 186, signups: 80, errors: 12 },
  { month: "Feb", visits: 305, signups: 200, errors: 18 },
  { month: "Mar", visits: 237, signups: 120, errors: 9 },
  { month: "Apr", visits: 273, signups: 190, errors: 14 },
  { month: "May", visits: 209, signups: 130, errors: 7 },
  { month: "Jun", visits: 314, signups: 240, errors: 11 },
];
const lineConfig = {
  visits: { label: "Visits", color: "var(--chart-1)" },
  signups: { label: "Signups", color: "var(--chart-2)" },
  errors: { label: "Errors", color: "var(--chart-4)" },
} satisfies ChartConfig;

const barData = [
  { category: "Runtime", used: 42, free: 18 },
  { category: "MCP", used: 28, free: 12 },
  { category: "Dashboard", used: 63, free: 7 },
  { category: "Skill", used: 15, free: 25 },
];
const barConfig = {
  used: { label: "Used (MB)", color: "var(--chart-3)" },
  free: { label: "Free (MB)", color: "var(--chart-5)" },
} satisfies ChartConfig;

const badgeVariants = ["default", "secondary", "destructive", "outline", "ghost", "link"] as const;
const buttonVariants = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const;

export function ThemeCanvas() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sliderValue, setSliderValue] = useState([50]);

  return (
    <div className="flex gap-4" style={{ fontFamily: "var(--font-ui)" }}>
      {/* Mini nav strip mock — a plain styled column, not the real Sidebar
          component (which expects a provider). Nav "links" are non-navigating
          buttons so this stays liftable with no router dependency. */}
      <nav className="flex w-40 shrink-0 flex-col gap-1 rounded-lg border bg-card p-2">
        {navItems.map(({ label, icon: Icon }) => (
          <a
            key={label}
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </a>
        ))}
      </nav>

      <div className="min-w-0 flex-1 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardHeader>
              <CardTitle style={{ fontFamily: "var(--font-display)" }}>1,284</CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Active apps</p></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle style={{ fontFamily: "var(--font-display)" }}>42.3 MB</CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Storage used</p></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle style={{ fontFamily: "var(--font-display)" }}>99.9%</CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Uptime</p></CardContent>
          </Card>
        </div>

        {/* Form section */}
        <Card>
          <CardHeader><CardTitle>Preferences</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="canvas-name">Display name</Label>
                <Input id="canvas-name" placeholder="Ada Lovelace" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="canvas-role">Role</Label>
                <Select defaultValue="editor">
                  <SelectTrigger id="canvas-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <Label className="gap-2">
                <Checkbox defaultChecked /> Email notifications
              </Label>
              <Label className="gap-2">
                <Switch defaultChecked /> Auto-sync
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="canvas-slider">Cache limit</Label>
              <Slider id="canvas-slider" value={sliderValue} onValueChange={setSliderValue} />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader><CardTitle>Recent files</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.type}</TableCell>
                    <TableCell>{row.size}</TableCell>
                    <TableCell className="text-muted-foreground">{row.updated}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>{variant}</Badge>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {buttonVariants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant === "default" ? "Primary" : variant[0].toUpperCase() + variant.slice(1)}
            </Button>
          ))}
        </div>

        {/* Dialog demo. NOTE: @lodekit/ui's DialogContent always wraps its
            popup in DialogPortal, which Base UI mounts on document.body by
            default — outside this canvas's cssVarsFor subtree, so it would
            render with the app's live vars instead of the preview ones.
            DialogContent has no container passthrough to redirect that
            portal, and adding one means editing packages/ui (out of scope
            here). So this demo skips Dialog/DialogPortal/DialogContent
            entirely and instead renders the dialog's content inline in a
            framed, non-portal box using local state — DialogHeader/
            DialogTitle/DialogDescription/DialogFooter are plain wrapper divs
            with no portal/context dependency, so they're safe to reuse here. */}
        <Card className="relative overflow-hidden">
          <CardHeader><CardTitle>Dialog</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={() => setDialogOpen((v) => !v)}>
              <PlusCircle aria-hidden="true" className="size-4" /> Open dialog
            </Button>
            {dialogOpen && (
              <div className="mt-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10">
                <DialogHeader>
                  <DialogTitle>Confirm action</DialogTitle>
                  <DialogDescription>
                    This preview dialog is rendered inline (no portal) so it stays within the theme
                    preview&apos;s scoped variables.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
                </DialogFooter>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts — colors reference var(--chart-1..5), resolved live from the
            cssVarsFor map on the ancestor, so they follow every edit and the
            light/dark toggle with no .dark class involved. */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Traffic</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={lineConfig} className="h-48 w-full">
                <LineChart data={lineData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="visits" stroke="var(--color-visits)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="signups" stroke="var(--color-signups)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="errors" stroke="var(--color-errors)" strokeWidth={2} dot={false} />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Storage by app</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={barConfig} className="h-48 w-full">
                <BarChart data={barData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="category" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="used" stackId="storage" fill="var(--color-used)" radius={4} />
                  <Bar dataKey="free" stackId="storage" fill="var(--color-free)" radius={4} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Icon row — a dozen glyphs from @lodekit/ui/icons. Note: components
            with Tailwind `dark:` variants (not used below) key off the
            `.dark` class, which this preview subtree intentionally never
            applies — only variable-driven theming previews here. */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-3 text-muted-foreground">
          {iconRow.map((Icon, i) => (
            <Icon key={i} aria-hidden="true" className="size-4" />
          ))}
        </div>
      </div>
    </div>
  );
}
