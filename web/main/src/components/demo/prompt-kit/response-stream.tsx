// Vendored from prompt-kit (MIT) — https://github.com/ibelick/prompt-kit
// @ de80375, trimmed for the scripted hero demo: typewriter mode only,
// string input only (no fade mode, no async iterables, no Intl.Segmenter).
import { useCallback, useEffect, useRef, useState } from "react";

export type UseTextStreamOptions = {
  textStream: string;
  segmentDelay?: number; // ms per character
  onComplete?: () => void;
};

export function useTextStream({
  textStream,
  segmentDelay = 25,
  onComplete,
}: UseTextStreamOptions) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const start = useCallback(() => {
    indexRef.current = 0;
    setDisplayedText("");
    setIsComplete(false);
    let lastFrame = 0;

    const step = (timestamp: number) => {
      if (segmentDelay > 0 && timestamp - lastFrame < segmentDelay) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      lastFrame = timestamp;
      indexRef.current += 1;
      setDisplayedText(textStream.slice(0, indexRef.current));
      if (indexRef.current < textStream.length) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        setIsComplete(true);
        onCompleteRef.current?.();
      }
    };

    if (textStream.length === 0) {
      setIsComplete(true);
      onCompleteRef.current?.();
      return;
    }
    frameRef.current = requestAnimationFrame(step);
  }, [textStream, segmentDelay]);

  useEffect(() => {
    start();
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [start]);

  return { displayedText, isComplete };
}

export function ResponseStream({
  textStream,
  segmentDelay = 25,
  className,
  as: Container = "div",
}: {
  textStream: string;
  segmentDelay?: number;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  const { displayedText } = useTextStream({ textStream, segmentDelay });
  return <Container className={className}>{displayedText}</Container>;
}
