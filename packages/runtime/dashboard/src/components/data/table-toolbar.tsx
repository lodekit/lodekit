import { useState } from "react";
import {
  Badge, Button, Input, Popover, PopoverContent, PopoverTrigger,
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from "@lodekit/ui";
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, RefreshCw, X } from "@lodekit/ui/icons";
import { OP_LABELS, type FilterOp, type FilterRule, type SortRule } from "../../lib/table-query";

const OPS = Object.keys(OP_LABELS) as FilterOp[];
const NO_VALUE: FilterOp[] = ["isnull", "notnull"];

export function TableToolbar({ columns, filters, onFiltersChange, sorts, onSortsChange, search, onSearchChange, onRefresh, refreshing }: {
  columns: { name: string }[];
  filters: FilterRule[];
  onFiltersChange: (f: FilterRule[]) => void;
  sorts: SortRule[];
  onSortsChange: (s: SortRule[]) => void;
  search: string;
  onSearchChange: (s: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const [draft, setDraft] = useState<{ column: string; op: FilterOp; value: string }>({ column: "", op: "eq", value: "" });
  const unsorted = columns.filter((c) => !sorts.some((s) => s.column === c.name));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-8 w-56"
        />

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm" className="h-8 border-dashed">
                <ListFilter /> Add filter
              </Button>
            }
          />
          <PopoverContent align="start" className="w-72 p-3">
            <div className="flex flex-col gap-2">
              {/* items: Base UI resolves the closed SelectValue through it — without
                  it the trigger shows the raw stored value ("gte") instead of the label. */}
              <Select
                value={draft.column}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, column: v }))}
                items={columns.map((c) => ({ value: c.name, label: c.name }))}
              >
                <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Column" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {columns.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={draft.op}
                onValueChange={(v) => v && setDraft((d) => ({ ...d, op: v as FilterOp }))}
                items={OPS.map((op) => ({ value: op, label: OP_LABELS[op] }))}
              >
                <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {OPS.map((op) => <SelectItem key={op} value={op}>{OP_LABELS[op]}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {!NO_VALUE.includes(draft.op) && (
                <Input
                  placeholder="Value"
                  value={draft.value}
                  onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
                  className="h-8"
                />
              )}
              <Button
                size="sm"
                disabled={!draft.column}
                onClick={() => {
                  onFiltersChange([...filters, { column: draft.column, op: draft.op, value: NO_VALUE.includes(draft.op) ? "" : draft.value }]);
                  setDraft({ column: "", op: "eq", value: "" });
                }}
              >
                Add
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant={sorts.length > 0 ? "secondary" : "outline"} size="sm" className="h-8">
                <ArrowUpDown /> {sorts.length > 0 ? `Sorted by ${sorts.length} rule${sorts.length === 1 ? "" : "s"}` : "Sort"}
              </Button>
            }
          />
          <PopoverContent align="start" className="w-72 p-3">
            <div className="flex flex-col gap-2">
              {sorts.length === 0 && <p className="text-muted-foreground text-xs">No sort rules. Order of addition sets precedence.</p>}
              {sorts.map((s, i) => (
                <div key={s.column} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-4 text-xs tabular-nums">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.column}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => onSortsChange(sorts.map((r) => (r.column === s.column ? { ...r, desc: !r.desc } : r)))}
                  >
                    {s.desc ? <ArrowDown /> : <ArrowUp />} {s.desc ? "desc" : "asc"}
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => onSortsChange(sorts.filter((r) => r.column !== s.column))}>
                    <X /><span className="sr-only">Remove sort on {s.column}</span>
                  </Button>
                </div>
              ))}
              {unsorted.length > 0 && (
                <Select
                  value=""
                  onValueChange={(v) => { if (v) onSortsChange([...sorts, { column: v, desc: false }]); }}
                  items={unsorted.map((c) => ({ value: c.name, label: c.name }))}
                >
                  <SelectTrigger className="h-8 w-full"><SelectValue placeholder="Add a column to sort by" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {unsorted.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button variant="outline" size="sm" className="ml-auto h-8" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={refreshing ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((f, i) => (
            <Badge key={i} variant="secondary" className="gap-1 font-mono text-xs font-normal">
              {f.column} {OP_LABELS[f.op]} {NO_VALUE.includes(f.op) ? "" : f.value}
              <button onClick={() => onFiltersChange(filters.filter((_, j) => j !== i))} aria-label={`Remove filter on ${f.column}`}>
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
