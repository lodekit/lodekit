// Pausable sequential runner for the demo script (spec §3). Each beat is
// applied immediately, then the runner waits beatDuration before the next —
// components animate within that budget, so the runner stays deterministic.
import { applyBeat, beatDuration, type Beat, type DemoState } from "./script";

export type Timeline = {
  play: (beats: Beat[], from: DemoState) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  playing: () => boolean;
};

export function createTimeline(
  onChange: (s: DemoState) => void,
  onDone: (s: DemoState) => void
): Timeline {
  let queue: Beat[] = [];
  let state: DemoState = { items: [], input: "", streamingIndex: null };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startedAt = 0;
  let remaining = 0;
  let paused = false;

  function wait(ms: number) {
    startedAt = Date.now();
    remaining = ms;
    timer = setTimeout(() => {
      timer = null;
      next();
    }, ms);
  }

  function next() {
    const beat = queue.shift();
    if (!beat) {
      onDone(state);
      return;
    }
    state = applyBeat(state, beat);
    onChange(state);
    wait(beatDuration(beat));
  }

  return {
    play(beats, from) {
      this.stop();
      queue = [...beats];
      state = from;
      paused = false;
      next();
    },
    pause() {
      if (paused || !timer) return;
      clearTimeout(timer);
      timer = null;
      remaining -= Date.now() - startedAt;
      paused = true;
    },
    resume() {
      if (!paused) return;
      paused = false;
      wait(Math.max(0, remaining));
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      queue = [];
      paused = false;
    },
    playing: () => timer !== null,
  };
}
