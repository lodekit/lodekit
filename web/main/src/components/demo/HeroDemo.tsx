// The hero demo island (docs/specs/2026-07-19-hero-demo-design.md).
// SSR renders the completed conversation; with motion allowed the island
// resets after the hero entrance, plays the script once, then rests.
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  CLEAR_SCRIPT,
  EMPTY,
  restState,
  SCRIPT,
  STREAM_MS,
  TYPE_MS,
  type DemoItem,
  type DemoState,
} from "./script";
import { createTimeline, type Timeline } from "./timeline";
import { Message, MessageContent } from "./prompt-kit/message";
import { PromptInput, PromptInputActions, PromptInputDisplay } from "./prompt-kit/prompt-input";
import { ToolRow } from "./prompt-kit/tool";
import { ReasoningRow } from "./prompt-kit/reasoning";
import { useTextStream } from "./prompt-kit/response-stream";
import { PromptSuggestion } from "./prompt-kit/prompt-suggestion";

const ENTRANCE_DELAY_MS = 900; // hero entrance (≤800ms) + settle

function DemoConversationItem({
  item,
  streamText,
}: {
  item: DemoItem;
  streamText?: string; // set only while this agent message is typewriting
}) {
  switch (item.kind) {
    case "user":
      return (
        <Message role="user">
          <MessageContent role="user">{item.text}</MessageContent>
        </Message>
      );
    case "agent":
      return (
        <Message role="agent">
          <MessageContent role="agent">
            {streamText !== undefined ? streamText : <AgentText text={item.text} />}
          </MessageContent>
        </Message>
      );
    case "options":
      return (
        <div className="flex flex-col gap-1.5 pl-0.5">
          {item.options.map((o, i) => (
            <PromptSuggestion key={o.label} label={o.label} detail={o.detail} pressed={item.pressed === i} />
          ))}
        </div>
      );
    case "reasoning":
      return <ReasoningRow label={item.label} active={item.active} />;
    case "tool":
      return <ToolRow via={item.via} name={item.name} caption={item.caption} done={item.done} />;
  }
}

// Renders the final message with its URL styled as a link (visual only —
// the demo is a movie; a real anchor would invite a dead-end click).
function AgentText({ text }: { text: string }) {
  const url = "http://lodekit.localhost/greenhouse";
  const at = text.indexOf(url);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="font-mono text-[0.8125rem] text-primary underline underline-offset-2">{url}</span>
      {text.slice(at + url.length)}
    </>
  );
}

const REST = restState();

function Transcript() {
  return (
    <div className="sr-only">
      <p>A conversation with an agent:</p>
      <ul>
        {REST.items.map((item, i) => (
          <li key={i}>
            {item.kind === "user" && `You: ${item.text}`}
            {item.kind === "agent" && `Agent: ${item.text}`}
            {item.kind === "options" &&
              `Options: ${item.options.map((o) => `${o.label} — ${o.detail}`).join(" / ")}`}
            {item.kind === "reasoning" && item.label}
            {item.kind === "tool" && `${item.name}: ${item.caption}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HeroDemo() {
  const [state, setState] = useState<DemoState>(REST);
  const [resting, setResting] = useState(true);
  const [reduced, setReduced] = useState(false);
  const timelineRef = useRef<Timeline | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cycleRef = useRef(0);
  const prevLenRef = useRef(REST.items.length);

  const { displayedText } = useTextStream({
    textStream: state.input,
    segmentDelay: TYPE_MS,
  });

  const streamingItem =
    state.streamingIndex !== null ? state.items[state.streamingIndex] : null;
  const { displayedText: streamedAgentText } = useTextStream({
    textStream: streamingItem?.kind === "agent" ? streamingItem.text : "",
    segmentDelay: STREAM_MS,
  });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    const tl = createTimeline(
      (s) => {
        if (s.items.length < prevLenRef.current) cycleRef.current += 1;
        prevLenRef.current = s.items.length;
        setState(s);
      },
      (s) => {
        setState({ ...s, streamingIndex: null });
        setResting(true);
      }
    );
    timelineRef.current = tl;
    const start = setTimeout(() => {
      setResting(false);
      prevLenRef.current = 0;
      cycleRef.current += 1;
      setState(EMPTY);
      tl.play(SCRIPT, EMPTY);
    }, ENTRANCE_DELAY_MS);

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) tl.resume();
        else tl.pause();
      },
      { threshold: 0.2 }
    );
    if (cardRef.current) io.observe(cardRef.current);

    return () => {
      clearTimeout(start);
      io.disconnect();
      tl.stop();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [state.items.length]);

  // keep the growing streamed message in view without restarting the
  // smooth scroll animation on every character
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [streamedAgentText]);

  const replay = () => {
    const tl = timelineRef.current;
    if (!tl || reduced) return;
    setResting(false);
    tl.play([...CLEAR_SCRIPT, ...SCRIPT], state);
  };

  return (
    <div
      ref={cardRef}
      className="flex h-[540px] flex-col overflow-hidden rounded-[8px] border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="kicker text-muted-foreground">Agent session — greenhouse</span>
        {resting && !reduced && (
          <button
            type="button"
            onClick={replay}
            aria-label="Replay demo"
            className="chip inline-flex cursor-pointer items-center gap-1.5 transition-opacity duration-200 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[3px] focus-visible:outline-ring"
            style={{ transitionTimingFunction: "var(--ease-drift)" }}
          >
            <RotateCcw className="size-3" />
            Replay
          </button>
        )}
      </div>
      <div aria-hidden="true" className="pointer-events-none flex min-h-0 flex-1 flex-col select-none">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4">
          {state.items.map((item, i) => (
            <div key={`${cycleRef.current}:${i}`} className="demo-item">
              <DemoConversationItem
                item={item}
                streamText={i === state.streamingIndex ? streamedAgentText : undefined}
              />
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3">
          <PromptInput>
            <PromptInputDisplay text={displayedText} />
            <PromptInputActions />
          </PromptInput>
        </div>
      </div>
      <Transcript />
    </div>
  );
}
