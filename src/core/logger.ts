const SECRET_KEYS = /cookie|csrf|authorization|session|set-cookie/i;

export function log(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const safeFields = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, SECRET_KEYS.test(key) ? "[REDACTED]" : value]),
  );
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...safeFields })}\n`);
}
