# Packaged-app smoke checklist (spec §11)

Run on a clean macOS account **without** system Node or pnpm (`node -v` and `pnpm -v` both
fail). Build the artifact first: `pnpm --filter @lodekit/manager make`.

1. [ ] Install: unzip, move `Lodekit.app` to `/Applications`, right-click → Open.
2. [ ] "⬡" appears in the menu bar; no dock icon; menu reads "Lodekit — starting…" then
       "Lodekit — running".
3. [ ] First run: `~/Documents/Lodekit/apps` + `data` were created; the dashboard opened
       in the browser by itself (empty app grid).
4. [ ] An app builds and serves: copy `root/apps/greenhouse` into
       `~/Documents/Lodekit/apps/`, watch the dashboard go `building… → ready`, open the
       app — it renders the Greenhouse conservatory page (e.g. "Fernando") — and interact
       with it.
5. [ ] MCP: paste the README snippet into an agent's MCP config; the agent lists Lodekit
       tools and can call them. (Headless check:
       `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' | <command + args from the README snippet>`
       prints an `initialize` result.)
6. [ ] Stop/Start from the menu works; "Open Logs" shows `manager.log` + `runtime.log`.
7. [ ] Error surfacing: with Lodekit stopped, start a dev runtime on the port (from the repo:
       `pnpm dev`), then Start → menu shows "Lodekit — error" with the port-in-use message;
       stop the dev runtime, Restart → running. (A non-runtime process squatting the port
       surfaces differently — the spawned runtime exits and the menu shows "Runtime exited
       unexpectedly"; both are surfaced errors, never a crash.)
8. [ ] "Start at Login": toggle on, log out/in, Lodekit is running.
9. [ ] Quit: `pgrep -f "Resources/platform/runtime"` prints nothing (no orphan).
10. [ ] Crash cleanup: `kill -9 <manager pid>` while running (find it via Activity
        Monitor), relaunch Lodekit.app — it terminates the stale runtime (pid file) and
        reaches "running".
