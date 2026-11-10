import { OpenAPIHono, z, type RouteConfig } from "@hono/zod-openapi";
import { MAX_WRAPPER_DEPTH } from "./zod-introspection.js";

/**
 * Finding the schemas a set of routes is built from, and the names they are emitted under.
 *
 * `createContract` has to write dropped `default` values back onto the emitted components, and
 * for that it needs to pair each `components.schemas[Name]` entry with the `ZodObject` that
 * produced it. It used to get that pairing for free by star-importing `http/schemas.ts` and
 * treating each export name as the component name. That tied the contract builder to one file:
 * moving a DTO into its own module would leave the loop with nothing to iterate, and the
 * defaults would silently stop being restored.
 *
 * So the pairing is derived from the routes instead. Wherever the DTOs live, a route reaches
 * them through its own declaration, and `.openapi("Name")` is what decides the component name —
 * both facts this module reads directly. That is what let the DTOs move out: each module now
 * declares its own under `<module>/http/schemas.ts` and the shared file is gone.
 */

/**
 * Every `ZodObject` reachable from a route's declaration.
 *
 * Walks request params/query/headers, every request body media type and every response body,
 * then descends through object fields, array elements and union options — a DTO referenced only
 * as a field of another DTO still gets its own component, so it still has to be found. `seen`
 * makes the walk terminate and keeps the shared enums from being re-walked ninety times.
 *
 * Handled: `ZodObject` fields, `ZodUnion` options, and everything `unwrap()` looks through —
 * which under Zod 4 covers `.optional()` / `.nullable()` / `.default()` and friends, and also
 * `ZodArray` and `ZodLazy` (see `unwrapped`).
 *
 * NOT handled: `ZodIntersection`, `ZodRecord` and `ZodTuple`. None is used by any declaration
 * today, and no speculative branch is added for them. If one appears, the objects underneath it
 * are not reached, and every `default` they declare is silently left off the emitted document —
 * the contract then understates what the server assumes. That is caught only when the missed
 * schema is itself emitted as an object component, by `contract.test.ts`'s "reaches every
 * emitted object component by walking the routes"; a non-object schema reached only that way
 * (an enum with a default behind an intersection, say) is emitted and missed with every test
 * still green. Adding a branch here is part of adding such a combinator to a declaration.
 *
 * The branches are held individually by `schema-discovery.test.ts`, on synthetic routes where
 * the schema under test is reachable through exactly one of them. The document-wide test above
 * cannot do that: it passes as long as some path reaches each DTO, and the real declarations
 * reach most of them several ways over.
 */
export function reachableObjects(routes: readonly RouteConfig[]): z.ZodObject[] {
  const found = new Set<z.ZodObject>();
  const seen = new Set<z.ZodType>();

  for (const route of routes) {
    const request = route.request;
    visit(request?.params, seen, found);
    visit(request?.query, seen, found);
    visit(request?.headers, seen, found);
    for (const media of Object.values(request?.body?.content ?? {}))
      visit(schemaOf(media), seen, found);

    for (const response of Object.values(route.responses))
      for (const media of Object.values(contentOf(response))) visit(schemaOf(media), seen, found);
  }

  return [...found];
}

/**
 * The media-type blocks a response documents.
 *
 * A response may also be written as a `$ref` to a shared component, which carries no content
 * of its own to walk. None of our declarations use that form — `endpoint` always builds the
 * block inline — but the type allows it, so it is read defensively rather than asserted away.
 */
function contentOf(response: RouteConfig["responses"][string]): Record<string, unknown> {
  return "content" in response ? (response.content ?? {}) : {};
}

/** The Zod schema a media-type block documents, when it names one. */
function schemaOf(media: unknown): z.ZodType | undefined {
  if (!media || typeof media !== "object" || !("schema" in media)) return undefined;
  const schema = (media as { schema: unknown }).schema;
  return schema instanceof z.ZodType ? schema : undefined;
}

/**
 * Looks through the wrappers `.optional()`, `.default()`, `.nullable()` and friends build
 * around a schema, to the schema underneath.
 *
 * Uses the public `unwrap()` rather than `_def.innerType`, and shares `MAX_WRAPPER_DEPTH` with
 * `declaredDefault` so both stop looking at the same point.
 *
 * Zod 4 gives `unwrap()` to more than the wrappers: `ZodArray.unwrap()` returns the element
 * type and `ZodLazy.unwrap()` resolves the thunk, so both are peeled here rather than by a
 * branch in `visit`. That is why `z.array(Dto)` arrives at `visit` as `Dto` — and why the
 * `ZodArray` branch below never fires under this version of Zod. It is kept as the explicit
 * statement that array elements must be descended into, so the property survives a Zod upgrade
 * that stops treating an array as unwrappable; `schema-discovery.test.ts` asserts the property
 * itself ("descends into array elements") rather than which of the two reaches it.
 */
function unwrapped(schema: z.ZodType): z.ZodType {
  let current = schema;

  for (let depth = 0; depth < MAX_WRAPPER_DEPTH; depth += 1) {
    if (!("unwrap" in current) || typeof current.unwrap !== "function") break;
    const inner: unknown = current.unwrap();
    if (!(inner instanceof z.ZodType)) break;
    current = inner;
  }

  return current;
}

function visit(schema: unknown, seen: Set<z.ZodType>, found: Set<z.ZodObject>): void {
  if (!(schema instanceof z.ZodType) || seen.has(schema)) return;
  seen.add(schema);

  const inner = unwrapped(schema);
  if (inner !== schema) {
    // Record the unwrapped schema too: the same inner object reached through a different
    // wrapper must not be walked twice.
    if (seen.has(inner)) return;
    seen.add(inner);
  }

  if (inner instanceof z.ZodObject) {
    found.add(inner);
    for (const field of Object.values(inner.shape)) visit(field, seen, found);
  } else if (inner instanceof z.ZodArray) {
    // Unreachable under Zod 4: `unwrapped` has already peeled the array. Kept deliberately —
    // see the note on `unwrapped`.
    visit(inner.element, seen, found);
  } else if (inner instanceof z.ZodUnion) {
    for (const option of inner.options) visit(option, seen, found);
  }
}

/** The name a wrapper property is given while the component names are recovered. */
const probeField = (index: number) => `p${index}`;

/** A component name no schema of ours declares, so the probe cannot collide with a real one. */
const PROBE_REF = "__SchemaNameProbe";

/**
 * The schemas keyed by the component name each is emitted under, dropping the anonymous ones.
 *
 * `.openapi("Name")` records that name in a registry private to `@asteasolutions/zod-to-openapi`
 * — a transitive dependency that cannot be imported here, and whose registry is not reachable
 * from the schema object either. So the name is recovered the way the generator itself reports
 * it: every candidate is hung off one throwaway wrapper object, that wrapper is emitted by a
 * throwaway generator, and each property comes back as a `$ref` to the component name the
 * schema carries. Anonymous schemas — the inline objects a route uses for its params or query —
 * are inlined instead of `$ref`-ed, and so are skipped: they have no component to fix up.
 *
 * One generator run for all of them, on a document that is thrown away; nothing here touches
 * the contract being built.
 */
export function schemasByComponentName(schemas: readonly z.ZodObject[]): Map<string, z.ZodObject> {
  const shape: Record<string, z.ZodType> = {};
  schemas.forEach((schema, index) => {
    shape[probeField(index)] = schema;
  });

  const probe = new OpenAPIHono();
  probe.openAPIRegistry.register(PROBE_REF, z.object(shape).openapi(PROBE_REF));
  const document = probe.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "probe", version: "0" },
  });

  const wrapper = document.components?.schemas?.[PROBE_REF] as
    { properties?: Record<string, { $ref?: string }> } | undefined;

  const byName = new Map<string, z.ZodObject>();
  schemas.forEach((schema, index) => {
    const name = wrapper?.properties?.[probeField(index)]?.$ref?.split("/").pop();
    if (!name) return;
    // Two schemas emitted under one component name would leave the document describing
    // whichever was registered last, and the fix-up below would restore defaults onto the
    // wrong one. Unreachable today — every name is unique — but nothing else would say so.
    const clash = byName.get(name);
    if (clash && clash !== schema)
      throw new Error(`Two different schemas are both emitted as ${name}`);
    byName.set(name, schema);
  });

  return byName;
}
