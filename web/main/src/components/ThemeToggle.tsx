import * as React from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";

export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  // Sync initial state from the class the no-flash script already set.
  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Storage unavailable (e.g. private mode) — theme still toggles in-page.
    }
  }

  return (
    <button
      type="button"
      className="btn-ghost size-9 p-0"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <SunIcon weight="regular" className="size-4" /> : <MoonIcon weight="regular" className="size-4" />}
    </button>
  );
}
