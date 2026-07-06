import React, { useEffect, useState } from "react";
import { addons, types, useGlobals } from "storybook/manager-api";

const TOOL_ID = "lodekit/app-theme";

// Served by the runtime at /_ui/, /api/apps lists the person's apps; pick one to
// preview components under that app's composed theme. In storybook dev the fetch
// fails and the picker stays hidden — stock theme only.
function AppPicker() {
  const [globals, updateGlobals] = useGlobals();
  const [apps, setApps] = useState<{ appId: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/apps")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setApps(Array.isArray(list) ? list : []))
      .catch(() => setApps([]));
  }, []);
  if (apps.length === 0) return null;
  const value = typeof globals.themeApp === "string" ? globals.themeApp : "";
  return (
    <select
      title="Preview with an app's theme"
      value={value}
      onChange={(e) => updateGlobals({ themeApp: e.target.value })}
      style={{ alignSelf: "center", marginLeft: 8 }}
    >
      <option value="">Theme: global</option>
      {apps.map((a) => (
        <option key={a.appId} value={a.appId}>
          Theme: {a.name}
        </option>
      ))}
    </select>
  );
}

addons.register(TOOL_ID, () => {
  addons.add(`${TOOL_ID}/tool`, {
    type: types.TOOL,
    title: "App theme",
    match: ({ tabId, viewMode }) => !tabId && (viewMode === "story" || viewMode === "docs"),
    render: () => <AppPicker />,
  });
});
