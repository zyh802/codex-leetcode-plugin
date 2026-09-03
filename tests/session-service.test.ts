import { describe, expect, it, vi } from "vitest";
import { LeetCodeCnAdapter } from "../src/adapter/leetcode-cn.js";
import { SessionService } from "../src/auth/session-service.js";
import { MemorySecretStore } from "../src/auth/secret-store.js";
import { AppError } from "../src/core/errors.js";

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

    expect(status).toEqual({
      signedIn: true,
      username: "local-user",
      premium: false,
      persistence: "system",
    });
    expect(service.getCredentials()).toEqual({
      session: "session-value-long-enough",
      csrf: "csrf-value-long-enough",
    });
    service.forget();
    expect(service.getCredentials()).toBeUndefined();
  });

  it("imports one complete Cookie header without exposing either credential", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    vi.spyOn(adapter, "getAuthStatus").mockResolvedValue({
      signedIn: true,
      username: "cookie-user",
      premium: true,
    });
    const service = new SessionService(new MemorySecretStore(), adapter);

    const status = await service.importCookie(
      "Cookie: foo=ignored; LEETCODE_SESSION=session-value-with=padding; csrftoken=csrf-value-long-enough",
    );

    expect(status).toEqual({
      signedIn: true,
      username: "cookie-user",
      premium: true,
      persistence: "system",
    });
    expect(service.getCredentials()).toEqual({
      session: "session-value-with=padding",
      csrf: "csrf-value-long-enough",
    });
    expect(JSON.stringify(status)).not.toContain("session-value");
    expect(JSON.stringify(status)).not.toContain("csrf-value");
  });

  it("rejects incomplete, duplicated, or multiline Cookie input", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    const service = new SessionService(new MemorySecretStore(), adapter);

    await expect(service.importCookie("LEETCODE_SESSION=session-value-long-enough")).rejects.toThrow(
      "must contain LEETCODE_SESSION and csrftoken",
    );
    await expect(service.importCookie(
      "LEETCODE_SESSION=session-value-one; LEETCODE_SESSION=session-value-two; csrftoken=csrf-value-long-enough",
    )).rejects.toThrow("more than one LEETCODE_SESSION");
    await expect(service.importCookie(
      "LEETCODE_SESSION=session-value-long-enough;\r\ncsrftoken=csrf-value-long-enough",
    )).rejects.toThrow("invalid format");
  });

  it("supports process-memory-only credentials without writing the system store", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    vi.spyOn(adapter, "getAuthStatus").mockResolvedValue({
      signedIn: true,
      username: "ephemeral-user",
      premium: false,
    });
    const secrets = new MemorySecretStore();
    const setSecret = vi.spyOn(secrets, "set");
    const service = new SessionService(secrets, adapter);

    const imported = await service.importSession({
      session: "session-value-long-enough",
      csrf: "csrf-value-long-enough",
    }, "memory");

    expect(imported.persistence).toBe("memory");
    expect(setSecret).not.toHaveBeenCalled();
    expect(await service.getStatus()).toMatchObject({ signedIn: true, persistence: "memory" });
    service.forget();
    expect(service.getCredentials()).toBeUndefined();
  });

  it("fails closed when no credential exists", () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    const service = new SessionService(new MemorySecretStore(), adapter);
    expect(() => service.getRequiredCredentials()).toThrow("Import a LeetCode session");
  });

  it("removes only the expired stored session when authentication fails", async () => {
    const adapter = new LeetCodeCnAdapter({} as never);
    vi.spyOn(adapter, "getAuthStatus")
      .mockResolvedValueOnce({ signedIn: true, username: "local-user", premium: false })
      .mockRejectedValueOnce(new AppError("AUTH_EXPIRED", "expired"));
    const service = new SessionService(new MemorySecretStore(), adapter);
    await service.importSession({ session: "session-value-long-enough", csrf: "csrf-value-long-enough" });

    await expect(service.getStatus()).rejects.toThrow("expired");
    expect(service.getCredentials()).toBeUndefined();
  });
});
