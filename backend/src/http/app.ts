import { OpenAPIHono, z, type RouteConfig } from "@hono/zod-openapi";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { AppError, type ErrorCode } from "../domain/error.js";
import { EndpointResponse, type Endpoint } from "../endpoint.js";
import { DEFAULT_MAX_BODY_BYTES, DEFAULT_MAX_MEDIA_BYTES } from "../limits.js";
import { reachableObjects, schemasByComponentName } from "./schema-discovery.js";
import { declaredDefault, isArraySchema } from "./zod-introspection.js";
import type { Principal } from "../domain/principal.js";

export interface ApiOptions {
  endpoints: Endpoint[];
  authenticate: (token: string) => Promise<Principal>;
  maxBodyBytes?: number;
  maxMediaBytes?: number;
  corsOrigins?: string[];
  production?: boolean;
  logError?: (error: unknown) => void;
  clientIp?: (context: Context) => string | null;
}

/**
 * Domain error codes mapped onto the status the contract documents for them.
 *
 * Typed as a total Record over ErrorCode, so adding a code without giving it a status is a
 * compile error rather than a silent 400.
 */
const errorStatuses: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  measurement_date_conflict: 409,
  validation_error: 422,
  rate_limited: 429,
};

const ONE_YEAR_SECONDS = 31_536_000;

const uploadKey = (method: string, routePath: string) => `${method.toUpperCase()} ${routePath}`;

/**
 * The routes held to the media size limit rather than the much smaller one covering JSON
 * bodies, keyed by the method and path template Hono matches on.
 *
 * Derived from the routes' own declarations — a route taking `multipart/form-data` is an
 * upload — instead of matching the request path against a pattern. The contract already
 * records which endpoints accept a file, so a new one gets the right limit by being
 * declared, with nothing to keep in step.
 */
function uploadPathSet(routes: RouteConfig[]): Set<string> {
  const uploads = new Set<string>();
  for (const route of routes)
    if (route.request?.body?.content?.["multipart/form-data"])
      uploads.add(uploadKey(route.method, toHonoPath(route.path)));
  return uploads;
}

/** PostgreSQL SQLSTATE class 23 — integrity constraint violation. */
const INTEGRITY_VIOLATION = /^23/;

function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details: unknown = null,
) {
  return c.json({ code, message, details }, status);
}

function registerSecurity(app: OpenAPIHono) {
  app.openAPIRegistry.registerComponent("securitySchemes", "HTTPBearer", {
    type: "http",
    scheme: "bearer",
  });
}

/** The query schema's field map, or an empty one for a route that declares no query. */
function queryShapeOf(route: RouteConfig): Record<string, z.ZodType> {
  return route.request?.query instanceof z.ZodObject ? route.request.query.shape : {};
}

/**
 * The endpoints in registration order, sorted by path and method.
 *
 * Sorted rather than taken in the order the caller assembled them, and that is load-bearing:
 * `components.schemas` in the generated contract is emitted in the order the routes are
 * registered, so this decides the order of 150 schema definitions in openapi.json. Sorting by
 * path and method makes it depend only on the routes themselves — not on how they are
 * distributed across the endpoint modules, nor on the order in which the caller lists them.
 * An operation can move between modules without touching the contract.
 *
 * `createApi` and `createContract` both register through this, so the served API and the
 * exported document always agree. Exported for `contract.test.ts`, which asserts both this
 * ordering and the resulting document.
 */
export function inRegistrationOrder(endpoints: Endpoint[]): Endpoint[] {
  return [...endpoints].sort((left, right) => {
    // Compared with < / > rather than localeCompare: the locale-aware collation treats `-`
    // and `{` as punctuation to look past, which orders /exercises/categories against
    // /exercises/{exercise_id} differently from the plain code-unit order the committed
    // contract was generated with.
    const a = `${left.route.path} ${left.route.method}`;
    const b = `${right.route.path} ${right.route.method}`;
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
}

/**
 * Builds the OpenAPI document from the endpoints' routes alone, without invoking a handler,
 * touching a database or building any provider — this is what `make contracts` exports and
 * what CI compares against.
 */
export function createContract(endpoints: Endpoint[]) {
  const routes = inRegistrationOrder(endpoints).map((endpoint) => endpoint.route);

  const app = new OpenAPIHono();
  registerSecurity(app);
  for (const route of routes) app.openAPIRegistry.registerPath(route);

  const document = app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: {
      title: "DopaFit API",
      version: "1.0.0",
      description: "Contract-first API for the DopaFit fitness app.",
    },
  });

  // A field or parameter that references a shared enum is emitted as a bare $ref, dropping
  // the default its schema declares. Writing it back keeps the contract honest about what the
  // server assumes, without inlining the enum — which would drop the reusable component that
  // generated clients depend on. Mutates the emitted document in place.
  const restoreDefault = (
    target: Record<string, unknown> | undefined,
    schema: z.ZodType | undefined,
  ) => {
    if (!target?.$ref || "default" in target || !schema) return;
    const fallback = declaredDefault(schema);
    if (fallback !== undefined) target.default = fallback;
  };

  type EmittedOperation = {
    parameters?: { name: string; in: string; schema?: Record<string, unknown> }[];
  };

  for (const route of routes) {
    const shape = queryShapeOf(route);
    const path = document.paths?.[route.path] as Record<string, EmittedOperation> | undefined;
    for (const parameter of path?.[route.method]?.parameters ?? [])
      if (parameter.in === "query") restoreDefault(parameter.schema, shape[parameter.name]);
  }

  // The schemas the fix-up applies to are found by walking the routes, not by importing the
  // file the DTOs happen to live in. That keeps this independent of how they are laid out:
  // a DTO moved into its own module is still reached through the route that declares it.
  const byName = schemasByComponentName(reachableObjects(routes));

  for (const [name, schema] of byName) {
    const emitted = document.components?.schemas?.[name] as
      { properties?: Record<string, Record<string, unknown>> } | undefined;
    if (!emitted?.properties) continue;
    for (const [field, property] of Object.entries(emitted.properties))
      restoreDefault(property, schema.shape[field]);
  }

  return document;
}

/**
 * Authenticates the caller when the route declares security. A non-empty `security` array is
 * what marks a route as protected; the public ones declare it as `[]`.
 */
async function resolvePrincipal(
  c: Context,
  route: RouteConfig,
  authenticate: ApiOptions["authenticate"],
): Promise<Principal | null> {
  if (!route.security?.length) return null;

  const token = c.req.header("Authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new AppError("unauthorized", "Missing access token");
  return authenticate(token);
}

function parseParams(c: Context, route: RouteConfig): Record<string, string> {
  return (route.request?.params?.parse(c.req.param()) ?? {}) as Record<string, string>;
}

/**
 * Reads the query string against the declared schema. A repeated parameter collapses to its
 * first value unless the schema says it is an array, so `?limit=1&limit=2` stays a number
 * while `?custom_slots=1&custom_slots=3` arrives as both values.
 */
function parseQuery(c: Context, route: RouteConfig): Record<string, unknown> {
  const shape = queryShapeOf(route);
  const raw: Record<string, unknown> = {};

  for (const [key, values] of Object.entries(c.req.queries()))
    raw[key] = shape[key] && isArraySchema(shape[key]) ? values : values[0];

  return (route.request?.query?.parse(raw) ?? {}) as Record<string, unknown>;
}

/**
 * Validates declared headers so a documented required header cannot be silently missing at
 * runtime. The parsed value is discarded — only the rejection matters.
 */
function validateHeaders(c: Context, route: RouteConfig): void {
  if (!(route.request?.headers instanceof z.ZodObject)) return;

  const declared = Object.keys(route.request.headers.shape);
  route.request.headers.parse(
    Object.fromEntries(declared.map((name) => [name, c.req.header(name)])),
  );
}

/**
 * Decodes and validates the request body against the content type the route documents. This
 * is the only place a body is validated: handlers receive the parsed value.
 */
async function parseBody(c: Context, route: RouteConfig): Promise<unknown> {
  if (!route.request?.body) return undefined;

  const contentType = c.req.header("Content-Type")?.split(";")[0].trim();
  const spec = contentType ? route.request.body.content[contentType] : undefined;
  if (!spec) throw new AppError("validation_error", "Request validation failed");

  let body: unknown;
  try {
    body =
      contentType === "application/json"
        ? await c.req.json()
        : Object.fromEntries(await c.req.raw.formData());
  } catch {
    throw new AppError("validation_error", "Request validation failed");
  }

  if ("schema" in spec && spec.schema instanceof z.ZodType) return spec.schema.parse(body);
  return body;
}

/**
 * The status a result carries, falling back to the first 2xx the route documents.
 *
 * That fallback makes response key order load-bearing: the three idempotent upserts document
 * both 200 and 201 with 200 first, and return 201 explicitly via `EndpointResponse` when they
 * actually created something. `contract.test.ts` pins that ordering.
 */
function successStatus(route: RouteConfig, result: unknown): number {
  if (result instanceof EndpointResponse) return result.status;
  return Number(Object.keys(route.responses).find((code) => code.startsWith("2")) ?? 200);
}

function serializeResult(c: Context, route: RouteConfig, result: unknown) {
  if (result instanceof Response) {
    if (!(result.status in route.responses))
      throw new Error(`Undocumented response status ${result.status}`);
    return result;
  }
  const status = successStatus(route, result);
  if (!(status in route.responses)) throw new Error(`Undocumented response status ${status}`);
  if (status === 204) return c.body(null, 204);

  const body = result instanceof EndpointResponse ? result.body : result;
  c.header("Content-Type", "application/json");
  return c.body(JSON.stringify(body), status as ContentfulStatusCode);
}

/** Translates a thrown error into the `{code, message, details}` shape the contract documents. */
function registerErrorHandler(app: OpenAPIHono, options: ApiOptions) {
  app.onError((error, c) => {
    if (error instanceof AppError) {
      if (
        error.code === "rate_limited" &&
        error.details &&
        typeof error.details === "object" &&
        "retry_after_seconds" in error.details
      )
        c.header("Retry-After", String(error.details.retry_after_seconds));

      const status = errorStatuses[error.code] ?? 400;
      return errorResponse(c, status, error.code, error.message, error.details);
    }

    if (error instanceof z.ZodError)
      return errorResponse(c, 422, "validation_error", "Request validation failed", error.issues);

    // A unique or foreign key violation raised past the repositories: report the conflict
    // rather than a 500. The driver reports the code on the error or on its cause.
    const cause = (error as { cause?: { code?: string } }).cause;
    if (INTEGRITY_VIOLATION.test((error as { code?: string }).code ?? cause?.code ?? ""))
      return errorResponse(c, 409, "conflict", "The request conflicts with the current state");

    options.logError?.(error);
    return errorResponse(c, 500, "internal_error", "Internal server error");
  });
}

function registerMiddleware(app: OpenAPIHono, routes: RouteConfig[], options: ApiOptions) {
  const strictTransportSecurity = options.production
    ? `max-age=${ONE_YEAR_SECONDS}; includeSubDomains`
    : false;

  // ПРЕВЬЮ ССЫЛКИ. `secureHeaders()` по умолчанию ставит
  // `Cross-Origin-Resource-Policy: same-origin` — запрет читать ресурс с
  // чужого origin. Для приложения это верно, но карточку ссылки рисует именно
  // ЧУЖОЙ сервер: Telegram, WhatsApp и прочие качают og:image к себе. С
  // `same-origin` картинка им недоступна, и превью уходит без неё —
  // при идеально размеченном HTML, отчего баг и выглядит как «og не работает».
  //
  // Поэтому на публичные картинки и манифест вешается отдельный экземпляр
  // middleware с `cross-origin`. Порядок важен: `secureHeaders` выставляет
  // заголовки ПОСЛЕ `await next()`, перезаписывая всё, что поставил внутренний
  // обработчик, — из статики это значение не переопределить, только отсюда.
  // Открыт ровно список превью-ресурсов: страница и бандлы приложения
  // остаются `same-origin`.
  for (const path of ["/icons/*", "/logo.svg", "/icon.svg", "/manifest.webmanifest"])
    app.use(
      path,
      secureHeaders({ strictTransportSecurity, crossOriginResourcePolicy: "cross-origin" }),
    );

  app.use("*", secureHeaders({ strictTransportSecurity }));

  app.use(
    "/api/*",
    cors({
      origin: options.corsOrigins ?? [],
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["Retry-After"],
    }),
  );

  // One limit for every /api route, including paths no handler claims — an unknown path is
  // still refused before its body is read. It has to be a single mounted middleware rather
  // than one per route: this runs before any route-level middleware, so a larger limit
  // mounted on the route itself would never be reached.
  const uploadPaths = uploadPathSet(routes);
  const mediaLimit = options.maxMediaBytes ?? DEFAULT_MAX_MEDIA_BYTES;
  const bodyLimitBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  app.use("/api/*", async (c, next) => {
    // `c.req.routePath` is this middleware's own pattern (`/api/*`); the route that will
    // actually handle the request is the last of the matched ones.
    const matched = c.req.matchedRoutes.at(-1)?.path ?? c.req.routePath;
    const isUpload = uploadPaths.has(uploadKey(c.req.method, matched));

    return bodyLimit({
      maxSize: isUpload ? mediaLimit : bodyLimitBytes,
      onError: () => errorResponse(c, 413, "payload_too_large", "Request body too large"),
    })(c, next);
  });
}

/** OpenAPI path templates (`/{id}`) in the shape Hono routes on (`/:id`). */
function toHonoPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

export function createApi(options: ApiOptions) {
  const endpoints = inRegistrationOrder(options.endpoints);

  const app = new OpenAPIHono();
  registerSecurity(app);
  registerMiddleware(
    app,
    endpoints.map((endpoint) => endpoint.route),
    options,
  );
  registerErrorHandler(app, options);

  for (const { route, handler } of endpoints) {
    app.openAPIRegistry.registerPath(route);
    app.on(route.method.toUpperCase(), toHonoPath(route.path), async (c) => {
      const principal = await resolvePrincipal(c, route, options.authenticate);
      const params = parseParams(c, route);
      const query = parseQuery(c, route);
      validateHeaders(c, route);
      const body = await parseBody(c, route);

      const result = await handler({
        body,
        params,
        query,
        principal,
        ip: options.clientIp?.(c) ?? null,
        headers: c.req.raw.headers,
      });

      return serializeResult(c, route, result);
    });
  }

  app.notFound((c) => errorResponse(c, 404, "not_found", "Not found"));
  return app;
}
