import { AppError } from "../core/errors.js";
import type { LeetCodeCnAdapter } from "../adapter/leetcode-cn.js";
import type { SessionCredentials } from "../adapter/http-client.js";
import type { SecretStore } from "./secret-store.js";

const SESSION_KEY = "leetcode.cn/session";
export type CredentialPersistence = "system" | "memory";

export interface SessionAuthStatus {
  signedIn: boolean;
  username: string | null;
  premium: boolean;
  persistence: CredentialPersistence | null;
}

export class SessionService {
  private volatileCredentials: SessionCredentials | undefined;

  constructor(
    private readonly secrets: SecretStore,
    private readonly adapter: LeetCodeCnAdapter,
  ) {}

  async importSession(
    credentials: SessionCredentials,
    persistence: CredentialPersistence = "system",
  ): Promise<SessionAuthStatus> {
    validateSecret("LEETCODE_SESSION", credentials.session);
    validateSecret("csrftoken", credentials.csrf);
    const status = await this.adapter.getAuthStatus(credentials);
    if (!status.signedIn) {
      throw new AppError("AUTH_EXPIRED", "The supplied LeetCode session is not signed in.");
    }
    if (persistence === "system") {
      this.secrets.set(SESSION_KEY, JSON.stringify(credentials));
      this.volatileCredentials = undefined;
    } else {
      this.volatileCredentials = { ...credentials };
    }
    return { ...status, persistence };
  }

  async importCookie(
    cookieHeader: string,
    persistence: CredentialPersistence = "system",
  ): Promise<SessionAuthStatus> {
    return this.importSession(parseCookieCredentials(cookieHeader), persistence);
  }

  getCredentials(): SessionCredentials | undefined {
    if (this.volatileCredentials !== undefined) return { ...this.volatileCredentials };
    return this.getStoredCredentials();
  }

  private getStoredCredentials(): SessionCredentials | undefined {
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

  async getStatus(): Promise<SessionAuthStatus> {
    const credentials = this.getCredentials();
    if (credentials === undefined) {
      return { signedIn: false, username: null, premium: false, persistence: null };
    }
    const persistence: CredentialPersistence = this.volatileCredentials === undefined ? "system" : "memory";
    try {
      const status = await this.adapter.getAuthStatus(credentials);
      if (!status.signedIn) throw new AppError("AUTH_EXPIRED", "The saved LeetCode session has expired.");
      return { ...status, persistence };
    } catch (error) {
      if (error instanceof AppError && error.code === "AUTH_EXPIRED") this.invalidateIfCurrent(credentials);
      throw error;
    }
  }

  invalidateIfCurrent(credentials: SessionCredentials): void {
    if (sameCredentials(this.volatileCredentials, credentials)) {
      this.volatileCredentials = undefined;
      return;
    }
    if (sameCredentials(this.getStoredCredentials(), credentials)) this.secrets.delete(SESSION_KEY);
  }

  hasStoredSession(): boolean {
    return this.getCredentials() !== undefined;
  }

  forget(): void {
    this.volatileCredentials = undefined;
    this.secrets.delete(SESSION_KEY);
  }
}

function sameCredentials(left: SessionCredentials | undefined, right: SessionCredentials): boolean {
  return left?.session === right.session && left.csrf === right.csrf;
}

export function parseCookieCredentials(cookieHeader: string): SessionCredentials {
  if (cookieHeader.length > 32_768 || /[\r\n]/u.test(cookieHeader)) {
    throw new AppError("INVALID_INPUT", "The LeetCode Cookie has an invalid format.");
  }
  const normalized = cookieHeader.trim().replace(/^cookie\s*:\s*/iu, "");
  const values = new Map<string, string>();
  for (const part of normalized.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== "LEETCODE_SESSION" && name !== "csrftoken") continue;
    if (values.has(name)) {
      throw new AppError("INVALID_INPUT", `The Cookie contains more than one ${name} value.`);
    }
    values.set(name, unquoteCookieValue(part.slice(separator + 1).trim()));
  }
  const session = values.get("LEETCODE_SESSION");
  const csrf = values.get("csrftoken");
  if (session === undefined || csrf === undefined) {
    throw new AppError("INVALID_INPUT", "The Cookie must contain LEETCODE_SESSION and csrftoken.");
  }
  validateSecret("LEETCODE_SESSION", session);
  validateSecret("csrftoken", csrf);
  return { session, csrf };
}

function unquoteCookieValue(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

function validateSecret(name: string, value: string): void {
  if (value.length < 8 || value.length > 16_384 || /[\r\n]/u.test(value)) {
    throw new AppError("INVALID_INPUT", `${name} has an invalid format.`);
  }
}
