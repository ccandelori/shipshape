export interface DeviceLoginOptions {
  onUserCode: (code: string, verifyUrl: string) => void;
  baseUrl?: string;
}

export interface AuthCodeOptions {
  // redirect etc for PKCE; callback based for browser
  baseUrl?: string;
}

export interface ClientCredentialsOptions {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

export interface ITokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

// Public error for all SDK calls
export class PublicApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly request_id?: string;

  constructor(status: number, body: { code: string; message: string; details?: Record<string, unknown>; request_id?: string }) {
    super(body.message || `HTTP ${status}`);
    this.name = 'PublicApiError';
    this.code = body.code;
    this.status = status;
    this.details = body.details;
    this.request_id = body.request_id;
  }
}
