import { Entry } from "@napi-rs/keyring";

export interface SecretStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}
export class KeyringSecretStore implements SecretStore {
  constructor(private readonly service = "codex-leecode-plugin") {}

  get(key: string): string | null {
    return new Entry(this.service, key).getPassword();
  }

  set(key: string, value: string): void {
    new Entry(this.service, key).setPassword(value);
  }

  delete(key: string): void {
    new Entry(this.service, key).deletePassword();
  }
}

export class MemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
  }

  delete(key: string): void {
    this.values.delete(key);
  }
}
