import { vi } from "vitest";

export function installFakeApi(respond: (path: string, body: unknown) => unknown): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = typeof input === "string"
      ? new URL(input, "http://localhost").pathname
      : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as unknown : undefined;
    return new Response(JSON.stringify({ ok: true, data: respond(path, body) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
