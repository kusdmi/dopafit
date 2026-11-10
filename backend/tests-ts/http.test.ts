import { describe, expect, it, vi } from "vitest";
import { createApi, createContract } from "../src/http/app.js";
import { contractEndpoints } from "../scripts/contract-endpoints.js";
import type { Endpoint, EndpointHandler } from "../src/endpoint.js";
import { AppError } from "../src/domain/error.js";

const principal = { id: "00000000-0000-4000-8000-000000000001", role: "client" as const };
const authenticate = vi.fn(async () => principal);
const options = { authenticate, maxBodyBytes: 256, corsOrigins: ["https://app.example.test"] };

/**
 * The handlers these tests stub, on the real routes that declare them.
 *
 * The routes come from `contractEndpoints()` — the same declarations the API serves,
 * assembled without a database — and only the handler is replaced, so these tests exercise
 * the adapter against real paths, schemas and security rather than against fixtures that
 * could drift from them.
 */
const endpoints = (handlers: Record<string, EndpointHandler>): Endpoint[] => {
  const declared = new Map(
    contractEndpoints().map((endpoint) => [endpoint.route.operationId, endpoint]),
  );

  return Object.entries(handlers).map(([operationId, handler]) => {
    const endpoint = declared.get(operationId);
    if (!endpoint) throw new Error(`No route declares operationId ${operationId}`);
    return { ...endpoint, handler };
  });
};
describe("HTTP adapter", () => {
  it("parses numeric path parameters and repeated numeric query values", async () => {
    const customField = vi.fn(async () => ({}));
    const series = vi.fn(async () => ({}));
    const app = createApi({
      ...options,
      endpoints: endpoints({
        measurements_update_custom_field: customField,
        analytics_anthropometry_series: series,
      }),
    });
    const headers = { authorization: "Bearer test", "content-type": "application/json" };
    const field = await app.request("/api/v1/measurements/custom-fields/1", {
      method: "PUT",
      headers,
      body: JSON.stringify({ name: "Test", unit: "cm" }),
    });
    expect(field.status).toBe(200);
    expect(customField).toHaveBeenCalledWith(expect.objectContaining({ params: { slot: 1 } }));
    const response = await app.request(
      "/api/v1/analytics/anthropometry/series?date_from=2026-01-01&date_to=2026-02-01&custom_slots=1&custom_slots=3",
      { headers },
    );
    expect(response.status).toBe(200);
    expect(series).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ custom_slots: [1, 3] }) }),
    );
  });
  it("validates requests before calling application handlers", async () => {
    const login = vi.fn(async () => ({}));
    const app = createApi({ ...options, endpoints: endpoints({ auth_login: login }) });
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: "test@example.com" }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "validation_error",
      message: "Request validation failed",
    });
    expect(login).not.toHaveBeenCalled();
  });
  it("requires authentication on protected routes", async () => {
    const handler = vi.fn(async () => ({}));
    const app = createApi({ ...options, endpoints: endpoints({ users_get_me: handler }) });
    const response = await app.request("/api/v1/users/me");
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
  it("returns unified domain errors and rate-limit retry headers", async () => {
    const app = createApi({
      ...options,
      endpoints: endpoints({
        auth_login: async () => {
          throw new AppError("rate_limited", "Try later", { retry_after_seconds: 60 });
        },
      }),
    });
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: "a@example.test", password: "test" }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
  it("rejects oversized bodies and never serves HTML for an unknown API", async () => {
    const app = createApi({ ...options, endpoints: endpoints({ auth_login: async () => ({}) }) });
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      body: "x".repeat(300),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: "payload_too_large" });
    const missing = await app.request("/api/v1/missing");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "not_found" });
  });
  it("holds upload routes to the media limit and every other route to the body limit", async () => {
    // The split is derived from the route declaring `multipart/form-data`, so this also
    // guards the derivation: were an upload route to stop being recognised as one, its
    // body would be cut off at the JSON limit instead.
    const addMedia = vi.fn(async () => ({}));
    const app = createApi({
      ...options,
      maxMediaBytes: 4096,
      endpoints: endpoints({
        exercises_add_exercise_media: addMedia,
        auth_login: async () => ({}),
      }),
    });

    const upload = new FormData();
    upload.set("file", new File(["x".repeat(1024)], "shot.jpg", { type: "image/jpeg" }));
    const accepted = await app.request(
      "/api/v1/exercises/00000000-0000-4000-8000-000000000002/media",
      { method: "POST", headers: { authorization: "Bearer test" }, body: upload },
    );
    expect(accepted.status).not.toBe(413);

    const oversized = new FormData();
    oversized.set("file", new File(["x".repeat(8192)], "shot.jpg", { type: "image/jpeg" }));
    const refused = await app.request(
      "/api/v1/exercises/00000000-0000-4000-8000-000000000002/media",
      { method: "POST", headers: { authorization: "Bearer test" }, body: oversized },
    );
    expect(refused.status).toBe(413);

    // A JSON route keeps the small limit even though the media one is far larger.
    const json = await app.request("/api/v1/auth/login", {
      method: "POST",
      body: "x".repeat(300),
    });
    expect(json.status).toBe(413);
  });
  it("does not expose unexpected exception details", async () => {
    const logger = vi.fn();
    const app = createApi({
      ...options,
      logError: logger,
      endpoints: endpoints({
        auth_login: async () => {
          throw new Error("postgres://secret");
        },
      }),
    });
    const response = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: "a@example.test", password: "test" }),
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
    expect(logger).toHaveBeenCalledOnce();
  });
  it("refuses to stub a handler no route declares", () => {
    // A route and its handler are one declaration now, so the API cannot serve a route
    // without an implementation. What remains is this helper's own guard: a test naming an
    // operationId nothing declares would otherwise build an app serving nothing and assert
    // against a 404 that means the opposite of what it reads as.
    expect(() => endpoints({ not_an_operation: async () => ({}) })).toThrow(
      /No route declares operationId not_an_operation/,
    );
  });
  it("exports all operations without constructing a database or providers", () => {
    const contract = createContract(contractEndpoints());
    expect(Object.keys(contract.paths ?? {}).length).toBeGreaterThan(70);
    expect(contract.paths?.["/api/v1/auth/login"]?.post?.operationId).toBe("auth_login");
  });
});
