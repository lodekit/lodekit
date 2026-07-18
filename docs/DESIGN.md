# lodekit — brand palette and typography

Source: logo illustration (cloud captured in a corked glass jar, warm/artisanal direction).
Landing page is natively light mode with watercolor illustrations (clouds, grass).
Single accent color across all product graphics: **cork amber** (higher-contrast revision).

## Typography

| Role | Font | Weights | License |
|---|---|---|---|
| Wordmark / headings | Fraunces (variable: opsz, wght, SOFT) | 500–600, SOFT axis ~50–100 for warmth | SIL OFL |
| UI / body | Hanken Grotesk | 400 body, 500 emphasis/buttons | SIL OFL |

- Wordmark: `lodekit` in Fraunces ~550 weight, lowercase. Optional treatment: "kit" in accent color.
- Google Fonts import:
  `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400..600,100&family=Hanken+Grotesk:wght@400;500&display=swap`

## Accent (cork amber)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#CE6F26` | `#E08A3C` | Buttons, fills, icons, active states |
| `--on-accent` | `#FFFFFF` | `#1B1004` | Text on accent fills |
| `--accent-text` | `#9C4D10` | `#F6AD64` | Links, accent-colored text (~6:1 on light bg) |

## Core neutrals

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7FAFD` | `#0E1B26` | Page background |
| `--text-heading` | `#132C44` | `#F4F9FD` | Headings, nav, wordmark base |
| `--text-body` | `#2E4B66` | `#B8CBDC` | Body and secondary text |

## Supporting colors (illustration only, never interactive)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--sky-wash` | `#A9CEF2` | `#4C7CA6` | Cloud/sky washes, jar glass outline |
| `--glass-fill` | `#D6E7F7` | `#1F4260` | Jar glass interior |
| `--grass` | `#79B356` | `#4A7238` | Grass footer illustration, meadow elements |
| `--cork` | `#C07B3A` | `#B57A42` | Cork texture in illustrations |
| `--cloud-white` | `#FFFFFF` / `#EEF4FA` | `#E9F1F8` / `#C6D8E8` | Cloud highlight / shadow pair |

## Usage rules

- One accent only: all interactive and brand-emphasis elements use the amber family.
- `--accent` for solid fills (buttons, toggles) with `--on-accent` text.
- `--accent-text` for links and accent text on plain backgrounds. Never use `--accent` directly as body-size text on white.
- Sky blues, grass greens, and cork tones are illustration-only. They fail contrast as UI and must not be used for buttons, links, or text.
- Grass green appears as landscape illustration (e.g. footer meadow with the jar sitting on grass), not as a semantic or interactive color.
- Dark mode is a blue night sky (`#0E1B26`), not neutral gray. Illustrations swap to their dark variants (dimmer glass, muted grass, softened cloud whites).

## Component sourcing

- Prefer stock upstream shadcn artifacts; express identity via tokens only — never
  fork or restyle component internals.

## CSS variables

```css
:root {
  --font-display: 'Fraunces', Georgia, serif;
  --font-ui: 'Hanken Grotesk', system-ui, sans-serif;

  --accent: #CE6F26;
  --on-accent: #FFFFFF;
  --accent-text: #9C4D10;

  --bg: #F7FAFD;
  --text-heading: #132C44;
  --text-body: #2E4B66;

  --sky-wash: #A9CEF2;
  --glass-fill: #D6E7F7;
  --grass: #79B356;
  --cork: #C07B3A;
  --cloud-hi: #FFFFFF;
  --cloud-lo: #EEF4FA;
}

[data-theme="dark"] {
  --accent: #E08A3C;
  --on-accent: #1B1004;
  --accent-text: #F6AD64;

  --bg: #0E1B26;
  --text-heading: #F4F9FD;
  --text-body: #B8CBDC;

  --sky-wash: #4C7CA6;
  --glass-fill: #1F4260;
  --grass: #4A7238;
  --cork: #B57A42;
  --cloud-hi: #E9F1F8;
  --cloud-lo: #C6D8E8;
}
```

## Quick reference

- Headings: Fraunces 550, `--text-heading`.
- Body/UI: Hanken Grotesk 400/500, `--text-body`.
- Accent fill is the same hue in both modes, brightened for dark; accent *text* swaps between deep and soft variants.
- Keep watercolor illustrations in the blue/green/cork families so the amber accent stays the single point of emphasis.
