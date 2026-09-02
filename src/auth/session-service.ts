import { AppError } from "../core/errors.js";
import type { LeetCodeCnAdapter } from "../adapter/leetcode-cn.js";
import type { SessionCredentials } from "../adapter/http-client.js";
import type { SecretStore } from "./secret-store.js";

const SESSION_KEY = "leetcode.cn/session";

export class SessionService {
  constructor(
    private readonly secrets: SecretStore,
    private readonly adapter: LeetCodeCnAdapter,
  ) {}

  async importSession(credentials: SessionCredentials): Promise<{
    signedIn: boolean;
    username: string | null;
    premium: boolean;
  }> {
    validateSecret("LEETCODE_SESSION", credentials.session);
    validateSecret("csrftoken", credentials.csrf);
    const status = await this.adapter.getAuthStatus(credentials);
    if (!status.signedIn) {
      throw new AppError("AUTH_EXPIRED", "The supplied LeetCode session is not signed in.");
    }
    this.secrets.set(SESSION_KEY, JSON.stringify(credentials));
    return status;
  }

  getCredentials(): SessionCredentials | undefined {
    const stored = this.secrets.get(SESSION_KEY);
    if (stored === null) return undefined;
    try {
      const value: unknown = JSON.parse(stored);
      if (
        typeof value === "object" && value !== null &&
        "session" in value && typeof value.session === "string" &&
        "csrf" in value && typeof value.csrf === "string"
      ) {
        return { session: value.session, csrf: value.csrf };
      }
    } catch {
      // Invalid credentials are deleted below so subsequent requests fail closed.
    }
    this.secrets.delete(SESSION_KEY);
    return undefined;
  }

  getRequiredCredentials(): SessionCredentials {
    const credentials = this.getCredentials();
    if (credentials === undefined) {
      throw new AppError("AUTH_MISSING", "Import a LeetCode session before using this operation.");
    }
    return credentials;
  }

  async getStatus(): Promise<{ signedIn: boolean; username: string | null; premium: boolean }> {
    const credentials = this.getCredentials();
    if (credentials === undefined) return { signedIn: false, username: null, premium: false };
    const status = await this.adapter.getAuthStatus(credentials);
    if (!status.signedIn) throw new AppError("AUTH_EXPIRED", "The saved LeetCode session has expired.");
    return status;
  }

  forget(): void {
    this.secrets.delete(SESSION_KEY);
  }
}
function validateSecret(name: string, value: string): void {
  if (value.length < 8 || value.length > 16_384 || /[\r\n]/u.test(value)) {
    throw new AppError("INVALID_INPUT", `${name} has an invalid format.`);
  }
}
