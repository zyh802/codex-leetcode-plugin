# Codex LeetCode Plugin

A Codex plugin for synchronizing the complete LeetCode CN problem catalog, opening selected problem details live, working on solution files, using LeetCode's remote judge, and asking Codex for scoped code reviews.

## Current implementation

- Codex plugin manifest, bundled stdio MCP server, and LeetCode Skill.
- SQLite WAL catalog with local number, title, and slug search.
- Fast synchronization of the complete algorithms, database, shell, and concurrency catalogs.
- Problem statements, samples, tags, metadata, and code templates are fetched live only when selected and are never cached locally.
- Persistent category-level pause/resume state and explicit catalog completeness statistics.
- Windows Credential Manager-backed LeetCode session storage.
- Local solution creation without overwriting user code.
- Compatibility with `@lc app/id/lang` and `@lc code=start/end` markers.
- Remote Run, Submit, judge polling, normalized results, and code-hash-bound submission confirmation.
- Scoped Codex review context with a contest guard.
- Loopback-only local HTTP catalog with a built-in code editor: create or reuse a solution, edit it immediately, and save with conflict protection while the conversation remains available.

Authentication, Run/Submit, and Codex review remain available through the conversational MCP tools; their visual panels are the next UI increment.

## Use the visual catalog

After installing the local plugin and building it, ask Codex:

```text
打开力扣题库
```

Codex calls `leetcode_open_catalog`, starts a local server on `127.0.0.1`, and opens its returned URL in the built-in Browser panel. In the catalog you can:

1. Click **同步目录** to fetch the four complete lightweight catalogs.
2. Search by problem number, title, or slug, and use **加载更多** to browse the full catalog in pages.
3. Click a problem to fetch its current statement, tags, and language templates live from LeetCode.
4. The shared solution directory defaults to the current Codex workspace. Change it once from the catalog-level directory bar when needed; every problem uses that same root.
5. Choose a language and create or reuse the local file without overwriting existing code. The file opens immediately in the built-in editor; save with the button or `⌘/Ctrl+S`.

The browser UI is a single bundled HTML page served by the plugin process. It uses authenticated same-origin HTTP APIs and does not fetch or persist every problem statement during catalog synchronization. The server stops with the MCP process and is not exposed to the LAN.

## Development

Requirements: Node.js 22.12 or newer.

```powershell
npm install
npm run check
npm run build
npm run smoke:mcp
```

`npm run smoke:mcp` checks the 19 tools, launches the loopback HTTP app, follows its authenticated redirect, and verifies the bundled catalog page.

`npm run smoke:live` performs low-frequency anonymous requests against `leetcode.cn`: one algorithms catalog request, one live `two-sum` detail request, plus an anonymous authentication-status query.

## Data and credentials

- Runtime data uses `PLUGIN_DATA` when installed by Codex. SQLite stores only the catalog, workspace mappings, synchronization state, and judge jobs; it does not store problem details.
- Set `CODEX_LEETCODE_DATA_DIR` to override the data directory during development.
- LeetCode credentials are stored through the operating-system credential store and are never written to SQLite.
- The plugin does not bypass Premium access and does not fetch hidden judge cases.

See [.ai-dev-docs/features/codex-leetcode-plugin/design.md](.ai-dev-docs/features/codex-leetcode-plugin/design.md) for the architecture and [.ai-dev-docs/features/codex-leetcode-plugin/tasks.md](.ai-dev-docs/features/codex-leetcode-plugin/tasks.md) for implementation progress.
