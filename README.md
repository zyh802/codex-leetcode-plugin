# Codex LeetCode Plugin

A Codex plugin for synchronizing the complete LeetCode CN problem catalog, opening selected problem details live, working on solution files, using LeetCode's remote judge, and asking Codex for scoped code reviews.

## Current implementation

- Codex plugin manifest, bundled stdio MCP server, and LeetCode Skill.
- SQLite WAL catalog with local number/title/slug search and difficulty, category, paid, completion, and favorite filters.
- Fast synchronization of the complete algorithms, database, shell, and concurrency catalogs.
- Problem statements, samples, tags, metadata, and code templates are fetched live only when selected and are never cached locally.
- Persistent category-level pause/resume state and explicit catalog completeness statistics.
- Cross-platform local secret storage through Windows Credential Manager, macOS Keychain, or Linux Secret Service.
- Browser-first LeetCode login in an isolated temporary Chrome/Edge profile, with automatic session capture and cleanup.
- Local solution creation without overwriting user code.
- Compatibility with `@lc app/id/lang` and `@lc code=start/end` markers.
- Bounded/cancellable Remote Run and Submit polling, persistent recovery, normalized results, and code-hash-bound submission confirmation.
- Retry-After-aware bounded retries with exponential backoff/jitter, schema circuit breaking, and expired-session invalidation.
- Scoped Codex review context with a contest guard.
- Loopback-only local HTTP catalog with authentication, a built-in code editor, sample/custom-input Run, confirmed Submit, judge results, and a scoped Codex-review handoff.
- React + Zustand frontend split into API, service, router, page, and reusable-component layers while still shipping as one offline HTML file.
- Page leases, heartbeat/release recovery, an in-page close action, and the idempotent `leetcode_close_catalog` tool stop only the HTTP listener and leave MCP available for reopening.

## Use the visual catalog

After installing the local plugin and building it, ask Codex:

```text
打开力扣题库
```

Codex calls `leetcode_open_catalog`, starts a local server on `127.0.0.1`, and opens its returned URL in the built-in Browser panel. In the catalog you can:

1. Click the person entry at the bottom of the sidebar, then choose **同步题库** from the upward-opening menu to fetch the four complete lightweight catalogs. The same menu also opens **设置**.
2. Search by problem number, title, or slug in the left sidebar. Click **筛选** to open the filter popover for difficulty, category, paid status, completion state, or favorite; use **加载更多** to browse pages.
3. Click a problem to fetch its current statement, tags, and language templates live from LeetCode.
4. The shared solution directory defaults to the current Codex workspace. Change it once from **设置 → 解答目录** when needed; every problem uses that same root.
5. Choose a language and create or reuse the local file without overwriting existing code. The right workspace has separate **题目 / 代码** tabs; creating or reusing a file switches to the full-height editor automatically. The catalog and active right tab scroll independently. **保存代码 / 运行 / 提交** stay together in the editor's bottom action bar; saving also supports `⌘/Ctrl+S`.
6. Open **设置 → 账号** and click **使用浏览器登录**. The plugin opens an isolated Chrome/Edge window on the official `leetcode.cn` login page, waits for you to finish QR/password/verification-code login, captures only `LEETCODE_SESSION` and `csrftoken`, validates the account, closes the window, and removes the temporary browser profile. Passwords and verification codes never pass through the plugin. Select **仅本次运行** to keep the credential in process memory instead of the system store. **高级登录** accepts one complete Cookie header only as a fallback. Logout is available from the same settings card.
7. Use a sample or custom input for **运行**. Once it has a remote job and is only waiting for its result, **提交** remains available. Poll controls appear only for a real active or resumable job, and each automatic wait has a hard 30-second boundary. **提交** always shows the exact problem, language, path, and code hash for confirmation; pending results continue to block duplicate submission of the same code. Accepted, failed, compile-error, runtime-error, timeout, and pending responses are presented as localized result cards instead of raw backend fields.
8. **让 Codex 评审** validates the scoped review context and copies a prompt back to the Codex conversation; the local Browser itself cannot directly send a new conversation message.
9. Use **设置 → 前端进程 → 关闭本地前端** when finished. This releases the page lease and stops the loopback listener without terminating the MCP plugin. Asking Codex to open the catalog again creates a fresh port and launch token. Codex can also call `leetcode_close_catalog` directly.

The browser UI is a React application whose source follows the same `App / routers / pages / components / services / api` boundaries used by CatPaw Mobile. Vite bundles those modules into one HTML page served by the plugin process. It uses authenticated same-origin HTTP APIs and does not fetch or persist every problem statement during catalog synchronization. The listener binds only to loopback and can be closed independently from MCP.

## Development

Requirements: Node.js 22.12 or newer. Browser login requires an installed Chrome or Edge; Windows tries Edge first, while macOS/Linux try Chrome first.

```powershell
npm install
npm run check
npm run build
npm run smoke:mcp
```

`npm run smoke:mcp` checks the 25 tools, launches the loopback HTTP app, follows its authenticated redirect, and verifies the bundled catalog page.

`npm run smoke:live` performs low-frequency anonymous requests against `leetcode.cn`: one algorithms catalog request, one live `two-sum` detail request, plus an anonymous authentication-status query.

## Data and credentials

- Runtime data uses `PLUGIN_DATA` when installed by Codex. SQLite stores only the catalog, workspace mappings, synchronization state, and judge jobs; it does not store problem details.
- Set `CODEX_LEETCODE_DATA_DIR` to override the data directory during development.
- LeetCode credentials are stored locally through the current user's operating-system credential store and are never written to SQLite, solution files, browser local storage, or logs. On Windows this is Credential Manager, on macOS Keychain, and on Linux Secret Service.
- The optional **仅本次运行** mode bypasses the operating-system store and keeps the validated credential only in MCP-process memory; it disappears when the plugin process exits.
- Browser login uses a new temporary browser profile rather than reading the user's normal Chrome/Edge cookie database. The profile is removed after success, cancellation, failure, timeout, or plugin shutdown.
- Read-only requests retry only transient failures. Unsafe Run/Submit POSTs are never automatically replayed; an uncertain Submit is persisted as `UNKNOWN` and blocks duplicate submission of the same code.
- The plugin does not bypass Premium access and does not fetch hidden judge cases.

See [.ai-dev-docs/features/codex-leetcode-plugin/design.md](.ai-dev-docs/features/codex-leetcode-plugin/design.md) for the architecture and [.ai-dev-docs/features/codex-leetcode-plugin/tasks.md](.ai-dev-docs/features/codex-leetcode-plugin/tasks.md) for implementation progress.
