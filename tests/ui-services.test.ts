// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogService, useCatalogStore } from "../ui/src/services/catalog/CatalogService.js";
import { useWorkspaceStore, workspaceService } from "../ui/src/services/workspace/WorkspaceService.js";

describe("frontend domain services", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    catalogService.resetForTests();
  });

  it("ignores stale search responses", async () => {
    const replies: Array<(response: Response) => void> = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => replies.push(resolve))));
    catalogService.setQuery("first");
    const first = catalogService.search();
    catalogService.setQuery("second");
    const second = catalogService.search();
    replies[1]?.(response([{ id: 2, frontendId: "2", slug: "second", title: "Second", difficulty: "Medium", paidOnly: false, status: null, favorite: false, categories: ["algorithms"] }]));
    await second;
    replies[0]?.(response([{ id: 1, frontendId: "1", slug: "first", title: "First", difficulty: "Easy", paidOnly: false, status: null, favorite: false, categories: ["algorithms"] }]));
    await first;
    expect(useCatalogStore.getState().problems.map((item) => item.slug)).toEqual(["second"]);
  });

  it("derives dirty editor state without storing it in a component", () => {
    useWorkspaceStore.setState({ solution: { filePath: "/tmp/a.ts", content: "old", codeHash: "a".repeat(64) }, draft: "old", dirty: false });
    workspaceService.updateDraft("new");
    expect(useWorkspaceStore.getState()).toMatchObject({ draft: "new", dirty: true });
    workspaceService.updateDraft("old");
    expect(useWorkspaceStore.getState().dirty).toBe(false);
  });
});

function response(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "Content-Type": "application/json" } });
}
