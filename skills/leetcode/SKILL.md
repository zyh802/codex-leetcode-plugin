---
name: leetcode
description: Use the complete locally synchronized LeetCode catalog to choose problems, fetch selected problem details live, create or inspect solution files, run code remotely, submit only with explicit confirmation, and review solutions with Codex.
---

# LeetCode workflow

Use the plugin's MCP tools whenever the user asks to browse LeetCode problems, open a problem, work on a solution, run or submit code, or review a solution.

When the user asks to browse, choose, or open the visual problem catalog, call `leetcode_open_catalog`. The UI can synchronize the complete lightweight directory, search and page through it, fetch a selected problem live, and create a language-specific solution. Keep authentication, Run/Submit, and review in the conversational tool workflow until those visual panels are available.

## Catalog rules

- Search and select problems from the local SQLite catalog.
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
- Never claim a solution is accepted unless the remote judge result is `Accepted`.

## Review workflow

Fetch the selected problem detail live, then review only that detail, the current code, and the selected judge result. Do not persist the detail after preparing the review context. Address correctness, invariant, complexity, boundary cases, missing tests, and language-specific readability. Prefer focused changes over replacing the entire solution unless the user explicitly asks for a rewrite.

During an active contest, do not provide solution generation, hidden hints, automated test generation, or answer review.
