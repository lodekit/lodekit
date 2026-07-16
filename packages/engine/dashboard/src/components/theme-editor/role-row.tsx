import { useState } from "react";
import { ChevronRight } from "@lodekit/ui/icons";
import { Badge, Collapsible, CollapsibleContent, CollapsibleTrigger, Input, Label } from "@lodekit/ui";
import type { Role } from "../../lib/theme-css";

// A native <input type="color"> only accepts 6-digit hex, so 3-digit hex is
// expanded and anything else (oklch, named colors) reports "not directly
// editable" — the caller shows the raw value as text with a disabled swatch.
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;
function toHex6(v: string): string | null {
  if (HEX6.test(v)) return v.toLowerCase();
  if (HEX3.test(v)) return ("#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
  return null;
}

// A neutral swatch shown when a role reads "mixed" (its lead tokens diverge) or
// holds a non-hex value the color picker can't represent. Picking a color from a
// mixed role unifies it via applyRole.
const NEUTRAL = "#808080";

// One color role: a swatch + label header that expands (Collapsible) to a text
// input per underlying token. Editing the swatch drives applyRole (whole role);
// editing a token input writes just that token.
export function RoleRow({
  role,
  value,
  tokens,
  disabled,
  onRole,
  onToken,
}: {
  role: Role;
  value: string | "mixed";
  tokens: { token: string; value: string }[];
  disabled: boolean;
  onRole: (color: string) => void;
  onToken: (token: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const mixed = value === "mixed";
  const hex = mixed ? null : toHex6(value);
  const nonHex = !mixed && hex === null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        {nonHex ? (
          // Non-hex value (e.g. oklch): show it as text, swatch disabled with a
          // title explaining hex-only editing.
          <input
            type="color"
            disabled
            value={NEUTRAL}
            title="Only hex colors are editable here — edit the file for oklch and named colors."
            className="h-7 w-9 shrink-0 cursor-not-allowed rounded border border-input opacity-50"
          />
        ) : (
          <input
            type="color"
            disabled={disabled}
            value={hex ?? NEUTRAL}
            onChange={(e) => onRole(e.target.value)}
            aria-label={`${role.label} color`}
            className="h-7 w-9 shrink-0 cursor-pointer rounded border border-input disabled:cursor-not-allowed disabled:opacity-50"
          />
        )}
        <CollapsibleTrigger
          className="flex flex-1 items-center gap-1.5 text-left text-sm outline-none"
          aria-label={`Toggle ${role.label} tokens`}
        >
          <ChevronRight
            aria-hidden="true"
            className={"size-3.5 text-muted-foreground transition-transform" + (open ? " rotate-90" : "")}
          />
          <span>{role.label}</span>
          {mixed && <Badge variant="outline">Mixed</Badge>}
          {nonHex && <span className="truncate text-xs text-muted-foreground">{value}</span>}
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-1.5 space-y-1.5 pl-11">
        {tokens.map(({ token, value: tv }) => (
          <div key={token} className="flex items-center gap-2">
            <Label className="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground" title={token}>
              {token}
            </Label>
            <Input
              value={tv}
              disabled={disabled}
              onChange={(e) => onToken(token, e.target.value)}
              className="h-7 font-mono text-xs"
            />
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Charts get five explicit swatches — no shared color, no derived foregrounds.
// Each swatch edits its own token directly; non-hex tokens fall back to text.
export function ChartsRow({
  tokens,
  disabled,
  onToken,
}: {
  tokens: { token: string; value: string }[];
  disabled: boolean;
  onToken: (token: string, value: string) => void;
}) {
  return (
    <div className="border-b py-2 last:border-b-0">
      <div className="mb-1.5 text-sm">Charts</div>
      <div className="space-y-1.5">
        {tokens.map(({ token, value }) => {
          const hex = toHex6(value);
          return (
            <div key={token} className="flex items-center gap-2">
              {hex === null ? (
                <input
                  type="color"
                  disabled
                  value={NEUTRAL}
                  title="Only hex colors are editable here — edit the file for oklch and named colors."
                  className="h-7 w-9 shrink-0 cursor-not-allowed rounded border border-input opacity-50"
                />
              ) : (
                <input
                  type="color"
                  disabled={disabled}
                  value={hex}
                  onChange={(e) => onToken(token, e.target.value)}
                  aria-label={token}
                  className="h-7 w-9 shrink-0 cursor-pointer rounded border border-input disabled:cursor-not-allowed disabled:opacity-50"
                />
              )}
              <Label className="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground" title={token}>
                {token}
              </Label>
              <Input
                value={value}
                disabled={disabled}
                onChange={(e) => onToken(token, e.target.value)}
                className="h-7 font-mono text-xs"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
