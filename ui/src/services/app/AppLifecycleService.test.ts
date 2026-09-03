// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { appLifecycleService } from "./AppLifecycleService.js";
import { installFakeApi } from "@/test/fakeApi.js";

describe("AppLifecycleService", () => {
  afterEach(async () => {
    await appLifecycleService.shutdown();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pairs global listeners and releases its page lease", async () => {
    const api = installFakeApi((path, body) => {
      if (path === "/api/clients/register") return { pageId: (body as { pageId: string }).pageId, activeClients: 1, heartbeatIntervalMs: 30_000, expiresAfterMs: 120_000 };
      if (path === "/api/clients/release") return { released: true, activeClients: 0 };
      if (path === "/api/bootstrap") return { stats: { total: 0, lastUpdatedAt: null, categories: [] }, query: "", problems: [], workspace: { workspaceRoot: "/workspace", solutionRoot: "/workspace", customized: false } };
      if (path.endsWith("leetcode_auth_status")) return { signedIn: true, username: "tester", premium: false, persistence: "memory" };
      if (path.endsWith("leetcode_search_problems")) return [];
      return {};
    });
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    await appLifecycleService.startup();
    await appLifecycleService.shutdown();
    for (const type of ["online", "pagehide", "pageshow", "beforeunload"]) {
      expect(add.mock.calls.some(([event]) => event === type)).toBe(true);
      expect(remove.mock.calls.some(([event]) => event === type)).toBe(true);
    }
    expect(api.mock.calls.some(([input]) => String(input).includes("/api/clients/release"))).toBe(true);
  });
});
