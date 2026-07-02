const { app, Tray, Menu, nativeImage, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { getPaths } = require("./paths");
const { openLogStream } = require("./logs");
const { Supervisor } = require("./supervisor");

if (!app.requestSingleInstanceLock()) app.exit(0);

const paths = getPaths({
  packaged: app.isPackaged,
  homedir: app.getPath("home"),
  resourcesPath: process.resourcesPath,
  repoRoot: path.resolve(__dirname, "..", ".."),
});

const managerLogStream = openLogStream(paths.logsDir, "manager.log");
const runtimeLogStream = openLogStream(paths.logsDir, "runtime.log");
const log = (msg) => managerLogStream.write(`${new Date().toISOString()} ${msg}\n`);

function spawnRuntime() {
  const child = spawn(paths.nodeBin, ["--import", "tsx", paths.runtimeEntry], {
    cwd: paths.runtimeDir, // bare `tsx` resolves from the runtime's node_modules
    env: {
      ...process.env,
      LODEKIT_ROOT: paths.lodekitRoot,
      LODEKIT_CACHE_DIR: paths.cacheDir,
      LODEKIT_PORT: String(paths.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(runtimeLogStream, { end: false });
  child.stderr.pipe(runtimeLogStream, { end: false });
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

const supervisor = new Supervisor({ spawnRuntime, checkHealth, pidFile: paths.pidFile });

let tray = null;
let bootError = null; // e.g. Lodekit root creation failed (spec §10)
let quitting = false;

const STATE_LABEL = {
  stopped: "Lodekit — stopped",
  starting: "Lodekit — starting…",
  running: "Lodekit — running",
  error: "Lodekit — error",
};

function rebuildMenu() {
  if (!tray) return;
  const state = bootError ? "error" : supervisor.state;
  const errorMessage = bootError ?? supervisor.errorMessage;
  const action = bootError
    ? []
    : state === "running" || state === "starting"
      ? [{ label: "Stop", click: () => supervisor.stop() }]
      : state === "error"
        ? [{ label: "Restart", click: () => supervisor.restart() }]
        : [{ label: "Start", click: () => supervisor.start() }];
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: STATE_LABEL[state], enabled: false },
      ...(state === "error" && errorMessage ? [{ label: errorMessage, enabled: false }] : []),
      { type: "separator" },
      {
        label: "Open Dashboard",
        enabled: state === "running",
        click: () => shell.openExternal(paths.dashboardUrl),
      },
      ...action,
      { type: "separator" },
      {
        label: "Start at Login",
        type: "checkbox",
        enabled: app.isPackaged,
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { label: "Open Logs", click: () => shell.openPath(paths.logsDir) },
      { type: "separator" },
      { label: "Quit Lodekit", click: quit },
    ])
  );
  tray.setTitle(state === "error" ? "⬡ !" : "⬡");
}

// Returns true when this launch created the root (= first run).
function ensureLodekitRoot() {
  const isFirstRun = !fs.existsSync(paths.lodekitRoot);
  fs.mkdirSync(path.join(paths.lodekitRoot, "apps"), { recursive: true });
  fs.mkdirSync(path.join(paths.lodekitRoot, "data"), { recursive: true });
  return isFirstRun;
}

async function quit() {
  if (quitting) return;
  quitting = true;
  log("quit requested");
  await supervisor.stop();
  app.exit(0);
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide(); // packaged builds also set LSUIElement
  tray = new Tray(nativeImage.createEmpty());
  supervisor.on("state", (state, msg) => {
    log(`state: ${state}${msg ? ` — ${msg}` : ""}`);
    rebuildMenu();
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
  supervisor.start();
});

// Tray app: no windows to close, keep running.
app.on("window-all-closed", () => {});

app.on("before-quit", (e) => {
  if (!quitting) {
    e.preventDefault();
    quit();
  }
});
