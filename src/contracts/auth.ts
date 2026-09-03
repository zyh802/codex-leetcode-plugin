export type CredentialPersistenceDto = "system" | "memory";

export interface AuthStatusDto {
  signedIn: boolean;
  username: string | null;
  premium: boolean;
  persistence: CredentialPersistenceDto | null;
}

export type BrowserLoginStateDto =
  | "IDLE"
  | "STARTING_BROWSER"
  | "WAITING_FOR_USER"
  | "VALIDATING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "TIMED_OUT";

export interface BrowserLoginStatusDto {
  flowId: string | null;
  state: BrowserLoginStateDto;
  message: string;
  startedAt: string | null;
  updatedAt: string;
  username: string | null;
  premium: boolean | null;
  persistence: CredentialPersistenceDto | null;
}
