const { app, Tray, Menu, nativeImage, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { getPaths } = require("./paths");
const { installShowcase, installGateways } = require("./firstRun");
const { openDailyLogStream, stampLines } = require("./logs");
const { Supervisor } = require("./supervisor");
const { getIconStyle, setIconStyle } = require("./settings");
const { createEngineSettings } = require("./engineSettings");

if (!app.requestSingleInstanceLock()) {
  // Second instance: leave before touching the primary's log files —
  // app.exit() alone doesn't stop the current tick.
  app.exit(0);
  process.exit(0);
}

const paths = getPaths({
  packaged: app.isPackaged,
  homedir: app.getPath("home"),
  resourcesPath: process.resourcesPath,
  repoRoot: path.resolve(__dirname, "..", ".."),
});

const managerLogStream = openDailyLogStream(paths.logsDir, "manager");
const engineLogStream = openDailyLogStream(paths.logsDir, "runtime"); // artifact name stays (ADR-0005)
const log = (msg) => managerLogStream.write(`${new Date().toISOString()} ${msg}\n`);

function spawnEngine() {
  const child = spawn(paths.nodeBin, ["--import", "tsx", paths.engineEntry], {
    cwd: paths.engineDir, // bare `tsx` resolves from the engine's node_modules
    env: {
      ...process.env,
      LODEKIT_ROOT: paths.lodekitRoot,
      LODEKIT_CACHE_DIR: paths.cacheDir,
      LODEKIT_STATE_DIR: paths.stateDir,
      LODEKIT_PORT: String(paths.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // One stamper per source: line-buffered, so stdout/stderr can't interleave
  // mid-line, and every runtime.log line carries a timestamp like manager.log.
  child.stdout.pipe(stampLines()).pipe(engineLogStream, { end: false });
  child.stderr.pipe(stampLines()).pipe(engineLogStream, { end: false });
  return child;
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: paths.port, path: "/api/apps", timeout: 1000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

const supervisor = new Supervisor({ spawnEngine, checkHealth, pidFile: paths.pidFile });
const engineSettings = createEngineSettings({
  port: paths.port,
  log,
  onIconStyle: (style) => applyIconStyle(style),
  cacheIconStyle: (style) => { try { setIconStyle(paths.settingsFile, style); } catch (e) { log(`settings cache: ${e.message}`); } },
  getLoginItem: () => app.getLoginItemSettings().openAtLogin,
  setLoginItem: (v) => app.setLoginItemSettings({ openAtLogin: v }),
  canSetLogin: app.isPackaged,
});

let tray = null;
let bootError = null; // e.g. Lodekit root creation failed (spec §10)
let quitting = false;
let iconStyle = getIconStyle(paths.settingsFile);

const STATE_LABEL = {
  stopped: "Lodekit — stopped",
  starting: "Lodekit — starting…",
  running: "Lodekit — running",
  error: "Lodekit — error",
};

// Monochrome template glyphs (macOS tints them for light/dark automatically). Files ship
// as jar-cloud-{style}-{state}-18.png with @2x siblings; nativeImage picks the retina one.
const iconsDir = path.join(__dirname, "..", "assets", "menubar-icons");
const iconCache = new Map();
function trayIcon(frame) {
  const key = `${iconStyle}-${frame}`;
  let img = iconCache.get(key);
  if (!img) {
    img = nativeImage.createFromPath(path.join(iconsDir, `jar-cloud-${key}-18.png`));
    img.setTemplateImage(true);
    iconCache.set(key, img);
  }
  return img;
}

// `starting` cycles starting-1→2→3 on a ~500 ms timer; every other state is a still frame.
let animTimer = null;
let animFrame = 1;
function stopAnim() {
  if (animTimer) {
    clearInterval(animTimer);
    animTimer = null;
  }
}
function updateTrayIcon() {
  if (!tray) return;
  const state = bootError ? "error" : supervisor.state;
  if (state === "starting") {
    if (!animTimer) {
      animFrame = 1;
      const tick = () => {
        tray.setImage(trayIcon(`starting-${animFrame}`));
        animFrame = (animFrame % 3) + 1;
      };
      tick();
      animTimer = setInterval(tick, 500);
    }
    return;
  }
  stopAnim();
  tray.setImage(trayIcon(state));
}

function applyIconStyle(style) {
  if (style === iconStyle) return;
  iconStyle = style;
  stopAnim(); // drop the running animation so it re-renders in the new style
  rebuildMenu(); // re-renders the tray icon
}

// Same setting as the dashboard's General → Launch at Login: apply to the OS here,
// and write it through to the engine so the dashboard toggle follows. When the
// engine is down, the start() reconcile (OS wins) catches the setting up later.
function toggleLoginItem() {
  const desired = !app.getLoginItemSettings().openAtLogin;
  app.setLoginItemSettings({ openAtLogin: desired });
  if (supervisor.state === "running") {
    engineSettings.setStartAtLogin(desired).catch((e) => log(`engineSettings: ${e.message}`));
  }
  rebuildMenu();
}

function rebuildMenu() {
  if (!tray) return;
  const state = bootError ? "error" : supervisor.state;
  const errorMessage = bootError ?? supervisor.errorMessage;
  const action = bootError
    ? []
    : state === "running" || state === "starting"
      ? [{ label: "Stop", click: () => supervisor.stop().catch((e) => log(`supervisor: ${e.message}`)) }]
      : state === "error"
        ? [{ label: "Restart", click: () => supervisor.restart().catch((e) => log(`supervisor: ${e.message}`)) }]
        : [{ label: "Start", click: () => supervisor.start().catch((e) => log(`supervisor: ${e.message}`)) }];
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: STATE_LABEL[state], enabled: false },
      ...(state === "error" && errorMessage ? [{ label: errorMessage, enabled: false }] : []),
      {
        label: "Dashboard",
        enabled: state === "running",
        click: () => shell.openExternal(paths.dashboardUrl),
      },
      { type: "separator" },
      {
        label: "Settings",
        enabled: state === "running",
        click: () => shell.openExternal(`${paths.dashboardUrl}/_dashboard/settings`),
      },
      {
        label: "Launch at Login",
        type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        enabled: app.isPackaged, // dev builds never register the dev Electron (engineSettings canSetLogin)
        click: toggleLoginItem,
      },
      { type: "separator" },
      ...action,
      { label: "Quit Lodekit", click: quit },
    ])
  );
  updateTrayIcon();
}

// Returns true when this launch created the root (= first run).
function ensureLodekitRoot() {
  const isFirstRun = !fs.existsSync(paths.lodekitRoot);
  fs.mkdirSync(path.join(paths.lodekitRoot, "apps"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(paths.lodekitRoot, "data"), { recursive: true, mode: 0o700 });
  if (isFirstRun) {
    const installed = installShowcase(paths.showcaseAppsDir, paths.lodekitRoot);
    if (installed.length) log(`first run: installed showcase apps ${installed.join(", ")}`);
    installGateways(paths.showcaseGatewaysDir, paths.lodekitRoot);
  }
  return isFirstRun;
}

async function quit() {
  if (quitting) return;
  quitting = true;
  log("quit requested");
  try {
    await supervisor.stop();
  } catch (e) {
    log(`supervisor.stop failed: ${e.message}`);
  } finally {
    app.exit(0);
  }
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide(); // packaged builds also set LSUIElement
  tray = new Tray(nativeImage.createEmpty());
  supervisor.on("state", (state, msg) => {
    log(`state: ${state}${msg ? ` — ${msg}` : ""}`);
    rebuildMenu();
    if (state === "running") engineSettings.start().catch((e) => log(`engineSettings: ${e.message}`));
    else engineSettings.stop();
  });

  let firstRun = false;
  try {
    firstRun = ensureLodekitRoot();
  } catch (e) {
    bootError = `Could not create ${paths.lodekitRoot}: ${e.message}`;
    log(bootError);
  }
  rebuildMenu();
  if (bootError) return;

  if (firstRun) {
    const onState = (state) => {
      if (state !== "running") return;
      supervisor.off("state", onState);
      shell.openExternal(paths.dashboardUrl);
    };
    supervisor.on("state", onState);
  }
  log(`mode: ${paths.mode}, root: ${paths.lodekitRoot}`);
  supervisor.start().catch((e) => log(`supervisor: ${e.message}`));
});

// Tray app: no windows to close, keep running.
app.on("window-all-closed", () => {});

app.on("before-quit", (e) => {
  if (!quitting) {
    e.preventDefault();
    quit();
  }
});
