import { request, type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Data preparation over the public REST API.
 *
 * Preparation goes through the API and never through the UI, because every screen
 * it would click through is already covered by its own test (spec §2.3) — driving
 * it again only makes an unrelated failure fail two tests. The UI is used where
 * the UI itself is under test.
 *
 * The runner talks to the backend directly rather than through the frontend's dev
 * proxy: the proxy is the frontend's own concern and a 502 there would read as a
 * data-preparation failure.
 */
const apiBaseURL = process.env.E2E_API_URL ?? 'http://backend-e2e:8000';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

/**
 * The session user as the app persists it. Only the fields the suite reads are
 * named; the rest pass through, because the whole object is what gets stored and
 * narrowing it here would drop fields the screens depend on.
 */
export interface AuthUser {
  id: string;
  role: 'client' | 'trainer';
  email: string | null;
  [field: string]: unknown;
}

export interface AuthResponse {
  tokens: TokenPair;
  user: AuthUser;
}

export class Api {
  private constructor(private readonly context: APIRequestContext) {}

  static async create(): Promise<Api> {
    return new Api(await request.newContext({ baseURL: apiBaseURL }));
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  /** Signs in with a password and returns what `seedSession` needs. */
  async login(contact: string, password: string): Promise<AuthResponse> {
    const response = await this.context.post('/api/v1/auth/login', {
      data: { contact, password },
    });
    if (!response.ok()) {
      throw new Error(`Login failed for ${contact}: HTTP ${response.status()}`);
    }
    return (await response.json()) as AuthResponse;
  }

  /** GET as a signed-in user. The caller asserts the status it expects. */
  get(path: string, tokens: TokenPair): Promise<APIResponse> {
    return this.context.get(path, { headers: this.auth(tokens) });
  }

  /** POST as a signed-in user. The caller asserts the status it expects. */
  post(path: string, tokens: TokenPair, data?: unknown): Promise<APIResponse> {
    return this.context.post(path, { headers: this.auth(tokens), data: data ?? {} });
  }

  /** PUT as a signed-in user, for updating prepared records. */
  put(path: string, tokens: TokenPair, data: unknown): Promise<APIResponse> {
    return this.context.put(path, { headers: this.auth(tokens), data });
  }

  /** DELETE as a signed-in user, for test-scoped cleanup. */
  delete(path: string, tokens: TokenPair): Promise<APIResponse> {
    return this.context.delete(path, { headers: this.auth(tokens) });
  }

  /** POST with no credentials — the anonymous half of the auth flow. */
  anonymous(path: string, data?: unknown): Promise<APIResponse> {
    return this.context.post(path, { data: data ?? {} });
  }

  /**
   * A call a fixture cannot continue without, parsed into its response body.
   *
   * Preparation differs from a test here: a test asserts the status it expects,
   * while a fixture that got an unexpected one has nothing to hand the test and
   * must say so itself — otherwise the failure surfaces later as a missing row and
   * reads as a product defect. The status and body go into the message because a
   * fixture failure is debugged from the report alone.
   */
  async expectOk<T>(what: string, call: Promise<APIResponse>, ...expected: number[]): Promise<T> {
    const response = await call;
    const statuses = expected.length ? expected : [200, 201];
    if (!statuses.includes(response.status())) {
      throw new Error(
        `${what} failed: HTTP ${response.status()} (expected ${statuses.join(' or ')}) — ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }

  private auth(tokens: TokenPair): Record<string, string> {
    return { Authorization: `Bearer ${tokens.access_token}` };
  }
}
