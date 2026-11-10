import { createRoute, type RouteConfig } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { AppError } from "./domain/error.js";
import type { Principal } from "./domain/principal.js";

/**
 * The vocabulary an operation is declared in: what a handler receives, what it may answer
 * with, and the `endpoint` builder that pairs a route with the handler implementing it.
 *
 * It sits at the top level rather than under `http/` for the same reason `limits.ts` does:
 * it describes what an operation *is*, not the adapter that serves it. Both the modules
 * declaring operations and the dispatcher executing them need this vocabulary, and a module
 * may not depend on the HTTP layer — so the layering ban on the `http` directory stays a
 * single line with no carve-out for this file.
 *
 * Sections, in order: the handler boundary types, the runtime-status response, the response
 * blocks and the shared error/success DTOs they are built from, the Zod field helpers, the
 * declaration types, `endpoint` itself, and the principal helpers handlers narrow their
 * caller with.
 */

/**
 * What a handler receives. `createApi` has already validated every field against the schemas
 * the route declares, so `body` holds the parsed value — not the raw request.
 *
 * `TBody` is `unknown` by default; `endpoint` narrows it for handlers whose declaration names
 * a JSON body schema.
 */
export interface EndpointInput<TBody = unknown> {
  body: TBody;
  query: Record<string, unknown>;
  params: Record<string, string>;
  principal: Principal | null;
  ip: string | null;
  headers: Headers;
}

export type EndpointHandler = (input: EndpointInput) => Promise<unknown>;

/** A route paired with the handler that implements it, as produced by `endpoint`. */
export interface Endpoint {
  route: RouteConfig;
  handler: EndpointHandler;
  /**
   * The JSON schema that types the handler's `input.body`, when the declaration names one.
   *
   * Recorded so it can be compared against what the route documents: the two are meant to be
   * the same schema object, and `contract.test.ts` asserts they are. `endpoint` builds both
   * from the single `body` field, so they are the same reference by construction — the field
   * exists so that property stays checkable from the outside.
   */
  bodySchema?: z.ZodType;
}

export class EndpointResponse {
  constructor(
    public readonly body: unknown,
    public readonly status: number,
  ) {}
}

export const endpointResponse = (body: unknown, status: number) =>
  new EndpointResponse(body, status);

/**
 * The error body every documented failure carries.
 *
 * Kept here rather than among the DTOs because `failure` below is its only producer: leaving
 * it in the schema module would make the builder depend on the whole DTO file just to name
 * one shared object.
 */
export const ErrorResponse = z
  .object({
    code: z.string(),
    details: z.union([z.unknown(), z.null()]).optional(),
    message: z.string(),
  })
  .openapi("ErrorResponse");

/**
 * The body an operation answers with when it has nothing to report but success.
 *
 * Vocabulary rather than anyone's DTO: all four modules declare operations that return it, so
 * it belongs beside `ErrorResponse` — the other response shape the declarations share — and
 * not in any single module's schema file. Keeping it at the top level also means a module can
 * name it without reaching into the HTTP adapter, which the layering rule forbids.
 */
export const OkResponse = z
  .object({ ok: z.boolean().default(true).optional() })
  .openapi("OkResponse");

/**
 * Which side of a trainer-client pair an account is on.
 *
 * The one enum two modules genuinely share: auth names it in `UserOut`, and training names it
 * in the counterpart a link request is addressed to. Kept here rather than in either module's
 * schema file because the alternative is a schema import between modules — the single
 * cross-module edge this layout exists to avoid — and because a module may not reach into the
 * http directory, which is where it used to live.
 *
 * Its `describe` text still says "the shared schema module" and is left alone deliberately:
 * the string is emitted verbatim into the contract as this component's `description`, so
 * correcting the prose would rewrite a published document over a comment.
 */
export const AccountRole = z
  .enum(["client", "trainer"])
  .describe(
    "User account role. Kept in the shared schema module so every DTO (auth, users,\nlink-requests) references the same enum without creating circular imports between\nschema modules.",
  )
  .openapi("AccountRole");

/**
 * The response blocks routes are built from.
 *
 * Around 390 copies of `{description, content: {"application/json": {schema: ErrorResponse}}}`
 * made up most of routes.ts, which buried the part of each route that is actually specific to
 * it. `endpoint` now expands a list of error statuses into them, so these are called from one
 * place rather than written out ninety times.
 *
 * Each returns a fresh object rather than a shared constant: `registerPath` may annotate what
 * it is given, and one instance shared between ninety routes would couple them invisibly. The
 * key order — description before content — is preserved, since it is the order emitted into
 * the contract.
 */

function jsonContent(schema: z.ZodType) {
  return { "application/json": { schema } };
}

/** A success response carrying a body. */
export function ok(description: string, schema: z.ZodType) {
  return { description, content: jsonContent(schema) };
}

/** A failure, always shaped as the shared ErrorResponse. */
export function failure(description: string) {
  return { description, content: jsonContent(ErrorResponse) };
}

/**
 * Boolean query parameter. Query strings carry text, so the wire value is parsed
 * from 'true'/'false'; `.openapi({type:'boolean'})` overrides the emitted schema,
 * which otherwise documents the *input* side of the transform as a string enum and
 * makes generated clients send `"true"` instead of `true`.
 *
 * `.default()` must precede `.transform()`: applied after, it would bypass the
 * transform and yield the raw string for an omitted parameter.
 */
export const booleanQuery = (fallback?: boolean) => {
  const raw = z.enum(["true", "false"]);
  const parsed =
    fallback === undefined
      ? raw.transform((value) => value === "true")
      : raw.default(fallback ? "true" : "false").transform((value) => value === "true");
  return parsed.openapi({
    type: "boolean",
    ...(fallback === undefined ? {} : { default: fallback }),
  } as never);
};

/**
 * Integer path/query parameter. `z.coerce.number()` accepts `null`, so it emits
 * `type: ["integer","null"]` and drops `required` on path parameters; parsing the
 * digits explicitly keeps the emitted schema a plain required integer.
 */
export const integerParam = (options: { min?: number; max?: number } = {}) => {
  let parsed = z
    .string()
    .regex(/^-?\d+$/)
    .transform(Number)
    .pipe(z.number().int());
  if (options.min !== undefined) parsed = parsed.pipe(z.number().min(options.min)) as never;
  if (options.max !== undefined) parsed = parsed.pipe(z.number().max(options.max)) as never;
  return parsed.openapi({
    type: "integer",
    ...(options.min === undefined ? {} : { minimum: options.min }),
    ...(options.max === undefined ? {} : { maximum: options.max }),
  } as never);
};

/**
 * The phone number a contact or a client card may carry.
 *
 * Two modules validate a phone against it: auth, for a contact being registered, and
 * training, for the number written on a client card. They validate different things but the
 * emitted `pattern` is one string, so declaring it twice made the contract depend on two
 * copies staying identical; it lives here for the same reason AccountRole does, as the one
 * place both modules reach without either importing the other's schemas.
 *
 * Written with `new RegExp` and the literal source it was generated with: the pattern string
 * is emitted verbatim into the contract as `pattern`, so rewriting it as a regex literal —
 * however much tidier — would change what generated clients validate against. EMAIL_PATTERN
 * stays in auth's schemas, where it is still the only caller's.
 */
export const PHONE_PATTERN = new RegExp("^\\+\\d{10,15}$");

/** The error statuses a declaration may list, and the block each one expands to. */
const errorResponses = {
  401: () => failure("Unauthorized"),
  403: () => failure("Forbidden"),
  404: () => failure("Not found"),
  409: () => failure("Conflict"),
  422: () => failure("Validation error"),
  429: () => failure("Too many requests"),
} as const;

export type ErrorStatus = keyof typeof errorResponses;

/**
 * The fields a group of related operations can share — security, tags and the error set —
 * pulled out so a module can name its policy once and spread it into each declaration.
 */
export type EndpointPolicy = Pick<EndpointMeta, "security" | "tags" | "errors">;

/** A response block as OpenAPI describes it, and as `RouteConfig["responses"]` accepts. */
type ResponseConfig = RouteConfig["responses"][string];

/** A request body as `RouteConfig` accepts it; the package does not export the type. */
type RequestBody = NonNullable<NonNullable<RouteConfig["request"]>["body"]>;

/** The fields every declaration shares, whatever shape its request and responses take. */
interface EndpointMeta {
  method: RouteConfig["method"];
  path: string;
  operationId: string;
  tags: readonly string[];
  summary: string;
  /** The long-form prose some operations carry, emitted after `summary`. */
  description?: string;
  /** `[]` for a public route; `[{ HTTPBearer: [] }]` for one behind a token. */
  security: readonly NonNullable<RouteConfig["security"]>[number][];
  query?: z.ZodType;
  params?: z.ZodType;
  headers?: z.ZodType;
  /**
   * The error statuses the operation documents, expanded into the shared ErrorResponse block.
   * Order here is irrelevant — they are emitted in ascending numeric order.
   */
  errors?: readonly ErrorStatus[];
}

/** The fields both arms of `EndpointSuccess` share. */
interface SuccessMeta {
  /** The success response's description, defaulting to "Successful Response". */
  okDescription?: string;
  /**
   * A second, created-resource response for the idempotent upserts, which document both 200
   * and 201 and choose between them at runtime. Emitted after the 200, which stays first so
   * `successStatus` keeps defaulting to the "already existed" branch.
   */
  created?: { schema: z.ZodType; description?: string };
}

/**
 * How the success side of an operation is declared.
 *
 * A discriminated union on `status`, because the two arms want opposite things of `ok`: a
 * body-bearing 200/201 has no meaning without the schema that describes it, and a 204 has no
 * body to describe. Written as a union rather than one all-optional interface so neither
 * mistake is expressible — omitting `ok` on a 200 used to compile and emit an empty schema,
 * which generated `unknown` on the frontend *and* collapsed `HandlerResult` to `unknown`,
 * quietly disabling the handler return-type check on the one endpoint that had just lost its
 * contract. Passing `ok` alongside `status: 204` used to compile too, and was dropped.
 *
 * `okDescription` replaces the boilerplate prose and `created` adds a 201 alongside a 200 for
 * the idempotent upserts. `okDescription` is spelled apart from the route-level `description`
 * on purpose: one documents the operation, the other its success response.
 */
type EndpointSuccess<TOk extends z.ZodType | undefined = z.ZodType | undefined> =
  | (SuccessMeta & {
      /**
       * The schema of the success body, required for every status that carries one.
       *
       * Carried as a type parameter, not just a field, so `HandlerResult` can check the
       * handler's return value against the very schema the route documents.
       */
      ok: TOk & z.ZodType;
      /** The success status, defaulting to 200. */
      status?: 200 | 201;
    })
  | (SuccessMeta & {
      /** A 204 answers with no body, so there is no schema to name — and none may be. */
      ok?: undefined;
      status: 204;
    });

/**
 * What a handler may resolve to, given the schema its declaration names in `ok`.
 *
 * This is the check that keeps a handler honest about its own contract. `createApi`
 * serializes whatever a handler returns without validating it against the declared response
 * schema — that would cost a parse on every request — so if this type did not hold the
 * dispatcher would happily send a body the contract says is impossible, and nothing would
 * notice until a client broke on it.
 *
 * `EndpointResponse` is allowed alongside the inferred type for the three idempotent upserts,
 * which pick their status at runtime and so return `endpointResponse(value, 200 | 201)` rather
 * than a plain object. Its body is `unknown`, so those three are checked by their tests rather
 * than here.
 *
 * A declaration with no `ok` — the 204s, and only the 204s now that `EndpointSuccess` requires
 * a schema for every status that carries a body — has nothing to check against and keeps
 * `unknown`. That fallback is why `ok` had to become mandatory: an omitted schema used to land
 * here and silently switch the check off on the very endpoint that needed it.
 */
type HandlerResult<TOk extends z.ZodType | undefined> = TOk extends z.ZodType
  ? z.infer<TOk> | EndpointResponse
  : unknown;

/**
 * A declaration whose handler reads a JSON body parsed from `body`.
 *
 * An intersection rather than an `extends` clause: `EndpointSuccess` is a union, and an
 * interface cannot extend one. Distributing the rest of the declaration over both arms is
 * what carries the `status`/`ok` discrimination out to the call site.
 */
type JsonEndpointConfig<TBody extends z.ZodType, TOk extends z.ZodType | undefined> = EndpointMeta &
  EndpointSuccess<TOk> & {
    body: TBody;
    handler: (input: EndpointInput<z.infer<TBody>>) => Promise<HandlerResult<TOk>>;
  };

/** A declaration with no JSON body: a GET, a DELETE, or one of the two multipart uploads. */
type PlainEndpointConfig<TOk extends z.ZodType | undefined> = EndpointMeta &
  EndpointSuccess<TOk> & {
    body?: undefined;
    /**
     * A request body the `body` shortcut cannot express — the two `multipart/form-data`
     * uploads, which parse the form themselves and so leave `input.body` as `unknown`.
     */
    rawBody?: RequestBody;
    handler: (input: EndpointInput) => Promise<HandlerResult<TOk>>;
  };

/** The 2xx section, in the key order it must be emitted in. */
function successResponses(config: EndpointSuccess): Record<string, ResponseConfig> {
  const description = config.okDescription ?? "Successful Response";
  // The union guarantees the pairing the emitted block needs: a 204 carries no `ok`, and
  // every other status carries one. No assertion is required to read it.
  const responses: Record<string, ResponseConfig> =
    config.status === 204
      ? { "204": { description } }
      : { [config.status ?? 200]: ok(description, config.ok) };

  // Always after the 200 above: `successStatus` falls back to the first 2xx key, and these
  // routes return 201 explicitly only when they actually created something.
  if (config.created)
    responses["201"] = ok(
      config.created.description ?? "Successful Response",
      config.created.schema,
    );

  return responses;
}

/**
 * The full `responses` map: the success blocks, then the documented errors in ascending
 * numeric order. Key order is what the contract is emitted in, so it is built deliberately
 * rather than left to however a declaration happened to list its statuses.
 */
function allResponses(config: EndpointSuccess & EndpointMeta): RouteConfig["responses"] {
  const responses: Record<string, ResponseConfig> = successResponses(config);
  for (const status of [...(config.errors ?? [])].sort((a, b) => a - b))
    responses[status] = errorResponses[status]();
  return responses;
}

/** The `request` section, omitting the keys the declaration did not name. */
function request(config: EndpointMeta & { body?: z.ZodType; rawBody?: RequestBody }) {
  const parts: NonNullable<RouteConfig["request"]> = {};
  if (config.query) parts.query = config.query as never;
  if (config.params) parts.params = config.params as never;
  if (config.headers) parts.headers = config.headers as never;
  if (config.body)
    parts.body = { required: true, content: { "application/json": { schema: config.body } } };
  else if (config.rawBody) parts.body = config.rawBody;
  return parts;
}

/**
 * One operation — its contract and its handler — in a single declaration.
 *
 * The route is assembled here rather than written out, which is what makes the common case a
 * handful of lines: the repeated `{description, content}` error blocks become a list of
 * statuses, and the body schema is named once. That single `body` is both what the route
 * documents and what types `input.body`, so the two cannot drift: passing the wrong schema to
 * a handler is no longer expressible.
 *
 * The generated object's key order is load-bearing — `createContract` emits the document in
 * it — so the literals below spell out the order the committed contract was generated with.
 */
export function endpoint<TBody extends z.ZodType, TOk extends z.ZodType | undefined = undefined>(
  config: JsonEndpointConfig<TBody, TOk>,
): Endpoint;
export function endpoint<TOk extends z.ZodType | undefined = undefined>(
  config: PlainEndpointConfig<TOk>,
): Endpoint;
export function endpoint(
  config: (
    | JsonEndpointConfig<z.ZodType, z.ZodType | undefined>
    | PlainEndpointConfig<z.ZodType | undefined>
  ) & { rawBody?: RequestBody },
): Endpoint {
  const route = createRoute({
    method: config.method,
    path: config.path,
    operationId: config.operationId,
    tags: [...config.tags],
    summary: config.summary,
    ...(config.description === undefined ? {} : { description: config.description }),
    security: [...config.security],
    request: request(config),
    responses: allResponses(config),
  });

  return { route, handler: config.handler as EndpointHandler, bodySchema: config.body };
}

/** A protected binary read keeps its OpenAPI response and handler paired like JSON routes. */
export function binaryEndpoint(
  config: EndpointMeta & {
    contentTypes: readonly string[];
    handler: (input: EndpointInput) => Promise<Response>;
  },
): Endpoint {
  const responses: Record<string, ResponseConfig> = {
    "200": {
      description: "Binary content",
      content: Object.fromEntries(
        config.contentTypes.map((contentType) => [
          contentType,
          { schema: z.string().openapi({ format: "binary" }) },
        ]),
      ),
    },
  };
  for (const status of [...(config.errors ?? [])].sort((a, b) => a - b))
    responses[status] = errorResponses[status]();
  const route = createRoute({
    method: config.method,
    path: config.path,
    operationId: config.operationId,
    tags: [...config.tags],
    summary: config.summary,
    security: [...config.security],
    request: request(config),
    responses,
  });
  return { route, handler: config.handler as EndpointHandler };
}

/**
 * Narrowing `EndpointInput.principal` to a value.
 *
 * `createApi` already authenticates every route whose `security` is non-empty, so on those
 * routes the principal is present by construction. These helpers turn that guarantee into a
 * type: they exist to discharge the `Principal | null`, not to re-check access. A throw here
 * means a route was documented as public and then wired to a handler that needs a caller.
 */

/** The authenticated caller. */
export function requirePrincipal(input: EndpointInput): Principal {
  if (!input.principal) throw new AppError("unauthorized", "Not authenticated");
  return input.principal;
}

/** The authenticated caller's id, for handlers that need nothing else. */
export function requireUserId(input: EndpointInput): string {
  return requirePrincipal(input).id;
}
