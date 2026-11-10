import { z } from "@hono/zod-openapi";

/**
 * Reading facts back out of a Zod schema that its public API does not expose.
 *
 * Both helpers here look through the wrappers `.optional()`, `.default()`, `.nullable()` and
 * friends build around a schema. Zod offers no supported way to ask "what is underneath", so
 * `declaredDefault` reaches into the internal `_def`. That is deliberate and contained: it is
 * the reason both live in this file rather than being scattered through the request pipeline,
 * and it is the first thing to re-check on a Zod major upgrade.
 */

/**
 * How many wrappers deep to look. A field is realistically wrapped by a couple of
 * `.optional()` / `.default()` / `.nullable()` layers; the bound just stops a malformed or
 * self-referential schema from looping forever.
 *
 * Exported so `schema-discovery.ts`, which unwraps the same layers to find the object
 * underneath, stops looking at exactly the point `declaredDefault` does — a schema whose
 * default this file gives up on must not be one that file still claims to have found.
 */
export const MAX_WRAPPER_DEPTH = 5;

/**
 * Whether the schema ultimately describes an array, looking through wrappers.
 *
 * Used to decide how a repeated query parameter is read: `?custom_slots=1&custom_slots=3`
 * becomes an array for an array-typed parameter and the first value for every other one.
 */
export function isArraySchema(schema: z.ZodType): boolean {
  if (schema instanceof z.ZodArray) return true;
  if ("unwrap" in schema && typeof schema.unwrap === "function")
    return isArraySchema(schema.unwrap());
  return false;
}

/**
 * The default a schema declares, or `undefined` when it declares none.
 *
 * Needed because a field that references a shared enum is emitted into the contract as a bare
 * `$ref`, which drops the default alongside it. Reading the default here lets the emitted
 * document state it explicitly while keeping the reusable component that generated clients
 * depend on.
 */
export function declaredDefault(schema: z.ZodType): unknown {
  let current: unknown = schema;

  for (let depth = 0; current && depth < MAX_WRAPPER_DEPTH; depth += 1) {
    const definition = (current as { _def?: { defaultValue?: unknown; innerType?: unknown } })._def;
    if (!definition) return undefined;

    if (definition.defaultValue !== undefined)
      return typeof definition.defaultValue === "function"
        ? (definition.defaultValue as () => unknown)()
        : definition.defaultValue;

    current = definition.innerType;
  }

  return undefined;
}
