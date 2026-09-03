---
name: leetcode
description: Use the complete locally synchronized LeetCode catalog to choose problems, fetch selected problem details live, create or inspect solution files, run code remotely, submit only with explicit confirmation, and review solutions with Codex.
---

# LeetCode workflow

Use the plugin's MCP tools whenever the user asks to browse LeetCode problems, open a problem, work on a solution, run or submit code, or review a solution.

When the user asks to browse, choose, or open the visual problem catalog, call `leetcode_open_catalog` and pass the current task workspace's absolute root path as `workspaceRoot`. It starts a loopback-only local HTTP app and returns a launch URL. Immediately open that URL in the Codex built-in Browser panel on the right when the host provides its browser-panel opener; do not embed it in the conversation as an MCP App. If the browser panel is unavailable, return the clickable local URL as the fallback.

The local web app can synchronize the complete lightweight directory, search/filter/page through it, fetch a selected problem live, sign in through an isolated official LeetCode browser window, forget a session, and create a language-specific solution. Browser login captures only the required session cookies after the user finishes login on `leetcode.cn`, validates them, stores them in the current operating-system credential store, and removes the temporary browser profile. The optional `memory` persistence mode retains them only until the MCP process exits. Never ask the user to paste credentials into the Codex conversation. The one-field complete-Cookie importer is an advanced fallback inside the local page, not the default workflow. Its shared solution directory defaults to the current task workspace and is changed only through the catalog-level directory control, never through an individual problem panel. The catalog and the active right-side panel scroll independently. The right workspace has separate problem/code tabs; creating or reusing a solution must switch to the full-height built-in editor, while switching back to the problem tab preserves the current draft. Saves use the file hash to reject overwriting external changes. The Browser panel also supports sample/custom-input Run, exact-hash-confirmed Submit, cancellable/recoverable result polling, and a review handoff that copies a prompt back to the conversation. Poll controls are shown only for real jobs; waiting for a Run result must not block Submit, while a pending Submit remains protected from duplicate replay. The local HTTP server is owned by the plugin process and must listen only on `127.0.0.1`. When the user asks to close it, prefer the in-page **关闭本地前端** action or call the idempotent `leetcode_close_catalog`; this stops only the HTTP listener and must not terminate MCP. A later `leetcode_open_catalog` call returns a fresh port and launch token.

## Catalog rules

- Search and select problems from the local SQLite catalog.
- Apply difficulty, catalog category, paid/free, account completion, and favorite filters locally; completion and favorite filters require a valid session.
- When authentication is required, prefer `leetcode_start_browser_login`, monitor it with `leetcode_get_browser_login_status`, and allow cancellation with `leetcode_cancel_browser_login`. Do not expose, repeat, log, or request the returned browser cookies.
- Use offset pagination for visual browsing; never load all problem statements into the UI.
- Synchronize only the complete problem directory. Do not prefetch every problem detail.
- When the user opens a selected problem, fetch its current statement, samples, tags, metadata, and templates from LeetCode.
- Never cache or persist problem details. Reopening a problem performs a new detail request.
- If the local catalog is incomplete, report the category sync status and offer to start or resume the catalog sync.
- Treat locked content as unavailable unless the current LeetCode account is entitled to it.

## Solution workflow

1. Resolve the chosen problem from the local catalog.
2. Fetch the current detail and language template from LeetCode without caching them.
3. Create or reuse the language-specific solution workspace.
4. Preserve existing user code. Never overwrite a solution merely because the upstream template changed.
5. Use remote Run for authoritative sample or custom-input execution.

## Submission safety

- Never submit without the user's explicit confirmation for the exact problem, language, file, and code hash.
- If the file changes after confirmation, obtain a new confirmation.
- Never automatically retry an unsafe Submit POST. If its response is uncertain, preserve the `UNKNOWN` job and block replay of the same request hash.
- Cancelling judge polling cancels only the local wait. Preserve the remote ticket and allow later result recovery.
- Never claim a solution is accepted unless the remote judge result is `Accepted`.

## Review workflow

Fetch the selected problem detail live, then review only that detail, the current code, and the selected judge result. Do not persist the detail after preparing the review context. Address correctness, invariant, complexity, boundary cases, missing tests, and language-specific readability. Prefer focused changes over replacing the entire solution unless the user explicitly asks for a rewrite.

During an active contest, do not provide solution generation, hidden hints, automated test generation, or answer review.
