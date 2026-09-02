import { describe, expect, it, vi } from "vitest";
import { LeetCodeCnAdapter } from "../src/adapter/leetcode-cn.js";
import { SessionService } from "../src/auth/session-service.js";
import { MemorySecretStore } from "../src/auth/secret-store.js";

describe("SessionService", () => {
  it("validates before storing and never returns the secret in status", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    vi.spyOn(adapter, "getAuthStatus").mockResolvedValue({
      signedIn: true,
      username: "local-user",
      premium: false,
    });
    const service = new SessionService(new MemorySecretStore(), adapter);

    const status = await service.importSession({
      session: "session-value-long-enough",
      csrf: "csrf-value-long-enough",
    });

    expect(status).toEqual({ signedIn: true, username: "local-user", premium: false });
    expect(service.getCredentials()).toEqual({
      session: "session-value-long-enough",
      csrf: "csrf-value-long-enough",
    });
    service.forget();
    expect(service.getCredentials()).toBeUndefined();
  });

  it("fails closed when no credential exists", () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    const service = new SessionService(new MemorySecretStore(), adapter);
    expect(() => service.getRequiredCredentials()).toThrow("Import a LeetCode session");
  });
});
