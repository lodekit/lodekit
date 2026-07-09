import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

type Handler = (e: MessageEvent) => void;
type StreamName = "event" | "log";

const SSEContext = createContext<{ subscribe: (name: StreamName, h: Handler) => () => void } | null>(null);

// One EventSource per dashboard tab. Owns every React Query invalidation the bus
// drives; pages needing the raw stream (events/logs live tail) subscribe via
// useSSEEvent instead of opening their own connection.
export function SSEProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const listeners = useRef(new Map<StreamName, Set<Handler>>());

  const subscribe = useCallback((name: StreamName, h: Handler) => {
    let set = listeners.current.get(name);
    if (!set) listeners.current.set(name, (set = new Set()));
    set.add(h);
    return () => { set.delete(h); };
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");
    const fan = (name: StreamName) => (e: Event) => {
      listeners.current.get(name)?.forEach((h) => h(e as MessageEvent));
    };
    const onLog = fan("log");
    const onEvent = fan("event");
    es.addEventListener("log", onLog);
    es.addEventListener("event", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { ns: string; type: string };
      if (d.type === "apps-changed") void queryClient.invalidateQueries({ queryKey: ["apps"] });
      if (d.type === "settings-change") void queryClient.invalidateQueries({ queryKey: ["settings", d.ns] });
      if (d.type === "secrets-change") void queryClient.invalidateQueries({ queryKey: ["secrets", d.ns] });
      if (d.type === "kv-store-change") void queryClient.invalidateQueries({ queryKey: ["kv", d.ns] });
      if (d.type === "tasks-change") {
        void queryClient.invalidateQueries({ queryKey: ["tasks", d.ns] });
        void queryClient.invalidateQueries({ queryKey: ["task-runs", d.ns] });
      }
      onEvent(e);
    });
    return () => es.close();
  }, [queryClient]);

  return <SSEContext.Provider value={{ subscribe }}>{children}</SSEContext.Provider>;
}

export function useSSEEvent(name: StreamName, handler: Handler) {
  const ctx = useContext(SSEContext);
  if (!ctx) throw new Error("useSSEEvent must be used inside SSEProvider");
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => ctx.subscribe(name, (e) => ref.current(e)), [ctx, name]);
}
