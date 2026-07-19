// The hero demo storyboard — single source of truth for the scripted
// conversation (docs/specs/2026-07-19-hero-demo-design.md §2).
// Beats are declarative targets; components animate toward them, and
// beatDuration budgets the time each beat's animation needs.

// Both ≥ 2 rAF frames (33.4ms) so the timeline's duration budget always
// covers the visual typewriter — otherwise streams snap at beat end.
export const TYPE_MS = 45; // input typewriter, ms per character
export const STREAM_MS = 35; // agent message stream, ms per character

export type DemoOption = { label: string; detail: string };

export type DemoItem =
  | { kind: "user"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "options"; options: DemoOption[]; pressed: number | null }
  | { kind: "reasoning"; label: string; active: boolean }
  | { kind: "tool"; via: "mcp" | "file"; name: string; caption: string; done: boolean };

export type DemoState = {
  items: DemoItem[];
  input: string;
  streamingIndex: number | null; // items index currently typewriting (agent msg)
};

export type Beat =
  | { do: "type"; text: string } // typewriter into the prompt input
  | { do: "post"; item: DemoItem } // append item; a user post clears the input
  | { do: "press"; option: number } // scripted press on the options row
  | { do: "toolDone" } // oldest running tool row completes
  | { do: "settle" } // reasoning row goes inactive
  | { do: "clear" } // conversation empties (replay)
  | { do: "hold"; ms: number };

export const EMPTY: DemoState = { items: [], input: "", streamingIndex: null };

const ASK = "Build me something to manage my greenhouse based on my local weather forecast.";

const OPTIONS: DemoOption[] = [
  { label: "Single file", detail: "works until it needs to remember anything. No storage, no schedule." },
  { label: "Cloud app", detail: "an account, a subscription, your data on someone else's computer." },
  { label: "Lodekit", detail: "runs on your Mac. Real database, scheduled tasks, yours forever." },
];

export const SCRIPT: Beat[] = [
  { do: "hold", ms: 600 },
  { do: "type", text: ASK },
  { do: "hold", ms: 500 },
  { do: "post", item: { kind: "user", text: ASK } },
  { do: "hold", ms: 900 },
  { do: "post", item: { kind: "agent", text: "I can build that a few ways:" } },
  { do: "post", item: { kind: "options", options: OPTIONS, pressed: null } },
  { do: "hold", ms: 6000 },
  { do: "press", option: 2 },
  { do: "hold", ms: 500 },
  { do: "post", item: { kind: "user", text: "Lodekit." } },
  { do: "hold", ms: 1100 },
  { do: "post", item: { kind: "reasoning", label: "Using skill: Building with Lodekit", active: true } },
  { do: "hold", ms: 2600 },
  { do: "settle" },
  { do: "post", item: { kind: "tool", via: "mcp", name: "lodekit_scaffold", caption: 'Scaffolding new Lodekit app "greenhouse"', done: false } },
  { do: "hold", ms: 2200 },
  { do: "toolDone" },
  { do: "hold", ms: 600 },
  { do: "post", item: { kind: "tool", via: "file", name: "greenhouse/src/db.ts", caption: "Creating the greenhouse database on your computer", done: false } },
  { do: "hold", ms: 2000 },
  { do: "toolDone" },
  { do: "hold", ms: 600 },
  { do: "post", item: { kind: "tool", via: "file", name: "greenhouse/src/gateways.ts", caption: "Connecting a secure gateway to the weather forecast", done: false } },
  { do: "hold", ms: 2000 },
  { do: "toolDone" },
  { do: "hold", ms: 900 },
  { do: "post", item: { kind: "agent", text: "Your app is ready at http://lodekit.localhost/greenhouse — it checks the forecast every morning and takes it from there." } },
];

export const CLEAR_SCRIPT: Beat[] = [
  { do: "type", text: "/clear" },
  { do: "hold", ms: 400 },
  { do: "clear" },
  { do: "hold", ms: 700 },
];

export function applyBeat(state: DemoState, beat: Beat): DemoState {
  switch (beat.do) {
    case "hold":
      return state;
    case "type":
      return { ...state, input: beat.text };
    case "post": {
      const items = [...state.items, beat.item];
      return {
        items,
        input: beat.item.kind === "user" ? "" : state.input,
        streamingIndex: beat.item.kind === "agent" ? items.length - 1 : null,
      };
    }
    case "press":
      return {
        ...state,
        items: state.items.map((it) =>
          it.kind === "options" ? { ...it, pressed: beat.option } : it
        ),
      };
    case "toolDone": {
      const i = state.items.findIndex((it) => it.kind === "tool" && !it.done);
      if (i === -1) return state;
      const items = [...state.items];
      const it = items[i];
      if (it.kind === "tool") items[i] = { ...it, done: true };
      return { ...state, items };
    }
    case "settle":
      return {
        ...state,
        items: state.items.map((it) =>
          it.kind === "reasoning" ? { ...it, active: false } : it
        ),
      };
    case "clear":
      return EMPTY;
  }
}

export function beatDuration(beat: Beat): number {
  switch (beat.do) {
    case "hold":
      return beat.ms;
    case "type":
      return beat.text.length * TYPE_MS;
    case "post":
      return beat.item.kind === "agent"
        ? beat.item.text.length * STREAM_MS + 450
        : 450;
    case "press":
      return 350;
    case "toolDone":
      return 350;
    case "settle":
      return 300;
    case "clear":
      return 500;
  }
}

export function restState(): DemoState {
  return { ...SCRIPT.reduce(applyBeat, EMPTY), streamingIndex: null };
}
