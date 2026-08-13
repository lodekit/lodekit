import { Mark } from "@lodekit/ui";

type SvgProps = { className?: string };

// Exported for the settings page: the icon_style select shows each option
// with its actual mark. The live chrome logo is AppShell's business now.
export const MARKS = {
  a: (p: SvgProps) => <Mark style="a" {...p} />,
  b: (p: SvgProps) => <Mark style="b" {...p} />,
  c: (p: SvgProps) => <Mark style="c" {...p} />,
} as const;
