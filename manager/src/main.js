const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORT = 7777;
const DASHBOARD_URL = `http://lodekit.localhost:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, "..", "..");

let runtime;

function startRuntime() {
  runtime = spawn(
    "pnpm",
    ["--filter", "@lodekit/runtime", "start"],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, LODEKIT_ROOT: path.join(REPO_ROOT, "examples") },
      stdio: "inherit",
    }
  );
  runtime.on("error", (err) => {
    console.error("Failed to start runtime. Is Node/pnpm on PATH?", err);
    app.quit();
  });
}

function waitForServer(retries = 300) {
  return new Promise((resolve, reject) => {
    const attempt = (left) => {
      const req = http.get(
        { host: "127.0.0.1", port: PORT, path: "/api/apps" },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", () => {
        req.destroy();
        if (left <= 0) return reject(new Error("runtime did not become ready"));
        setTimeout(() => attempt(left - 1), 200);
      });
    };
    attempt(retries);
  });
}

async function createWindow() {
  const win = new BrowserWindow({ width: 1100, height: 800 });
  await waitForServer();
  win.loadURL(DASHBOARD_URL);
}

app.whenReady().then(() => {
  startRuntime();
  createWindow().catch((err) => {
    console.error("Runtime did not become ready:", err.message);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("quit", () => {
  if (runtime) runtime.kill();
});
