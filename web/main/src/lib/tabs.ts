// Keyboard model for a WAI-ARIA tablist. Both axes are handled because the
// rail is vertical on desktop and stacks horizontally-ish on mobile.
export function nextTabIndex(current: number, key: string, count: number): number | null {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return (current + count - 1) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
