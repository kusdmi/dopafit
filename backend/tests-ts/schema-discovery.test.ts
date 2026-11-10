import { z, type RouteConfig } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { reachableObjects, schemasByComponentName } from "../src/http/schema-discovery.js";

/**
 * The walk in `schema-discovery.ts`, branch by branch.
 *
 * `contract.test.ts` already asserts the end-to-end property — every object component the real
 * document emits is reached and named. But it can only exercise a branch the real declarations
 * happen to need, and it passes as long as *some* path reaches each DTO. Disabling each branch
 * of the walk in turn and re-running the contract tests found four that the document-wide test
 * does not hold at all: array descent, and the params, query and headers arms of the top-level
 * walk. Every DTO reachable through an array is also reachable another way, and params, query
 * and headers reach no named component whatsoever today — they are inline objects of primitives
 * and enums, so nothing downstream notices when they stop being walked.
 *
 * So the branches are asserted here instead, on synthetic routes built for the purpose. Each
 * test declares a route on which the schema under test is reachable through exactly one branch
 * and no other, which states the property directly: this branch descends. Stretching the
 * document-wide test could not do that — it would have meant adding a DTO to the real contract
 * purely to be walked, changing the committed `openapi.json` in order to test the walker.
 *
 * These use `reachableObjects` rather than `createContract` for the same reason: the walk is
 * the unit, and a synthetic route never has to be emitted into the committed document.
 *
 * One caveat, worth stating because it is counter-intuitive. The tests below are written
 * against the *property* ("an object under an array is reached"), not against the branch that
 * currently delivers it. For arrays those differ: Zod 4 gives `ZodArray` an `unwrap()`, so
 * `unwrapped` peels the array and the `ZodArray` branch in `visit` is unreachable — making that
 * branch throw on entry leaves the whole suite green. The property is what matters and the
 * property is what is asserted, so these keep holding whichever of the two does the descending.
 */

/** A minimal route declaration; each test overrides just the part it is exercising. */
function route(overrides: Partial<RouteConfig>): RouteConfig {
  return {
    method: "get",
    path: "/synthetic",
    responses: { 204: { description: "No content" } },
    ...overrides,
  };
}

/** A JSON response body block, the shape `endpoint` builds for a documented response. */
const jsonResponse = (schema: z.ZodType): RouteConfig["responses"] => ({
  200: { description: "OK", content: { "application/json": { schema } } },
});

describe("reachableObjects", () => {
  it("descends into array elements", () => {
    // One of the gaps the census found: no contract test held this. `nested` sits under an
    // array and nowhere else, so reaching it at all requires descending through the array.
    const nested = z.object({ value: z.string() });
    const found = reachableObjects([route({ responses: jsonResponse(z.array(nested)) })]);

    expect(found).toContain(nested);
  });

  it("descends into array elements nested inside an object field", () => {
    // The shape the real DTOs use: a list field on a response envelope. Distinct from the
    // case above because it needs the object branch and the array branch to compose.
    const item = z.object({ id: z.string() });
    const page = z.object({ items: z.array(item) });
    const found = reachableObjects([route({ responses: jsonResponse(page) })]);

    expect(found).toContain(item);
  });

  it("descends into object fields", () => {
    const leaf = z.object({ value: z.string() });
    const parent = z.object({ leaf });
    const found = reachableObjects([route({ responses: jsonResponse(parent) })]);

    expect(found).toContain(leaf);
  });

  it("descends into union options", () => {
    const left = z.object({ kind: z.literal("left") });
    const right = z.object({ kind: z.literal("right") });
    const found = reachableObjects([route({ responses: jsonResponse(z.union([left, right])) })]);

    expect(found).toEqual(expect.arrayContaining([left, right]));
  });

  it("looks through optional, nullable and default wrappers", () => {
    // Three wrappers over one object, and the object appears nowhere unwrapped — so the walk
    // reaches it only by unwrapping. Also covers `unwrapped` iterating rather than peeling a
    // single layer.
    const wrapped = z.object({ value: z.string() });
    const found = reachableObjects([
      route({ responses: jsonResponse(wrapped.nullable().optional().default(null)) }),
    ]);

    expect(found).toContain(wrapped);
  });

  it("walks request params", () => {
    const nested = z.object({ value: z.string() });
    const found = reachableObjects([
      route({ request: { params: z.object({ id: z.string(), nested }) } }),
    ]);

    expect(found).toContain(nested);
  });

  it("walks request query", () => {
    const nested = z.object({ value: z.string() });
    const found = reachableObjects([
      route({ request: { query: z.object({ limit: z.string(), nested }) } }),
    ]);

    expect(found).toContain(nested);
  });

  it("walks request headers", () => {
    const nested = z.object({ value: z.string() });
    const found = reachableObjects([
      route({ request: { headers: z.object({ "x-trace": z.string(), nested }) } }),
    ]);

    expect(found).toContain(nested);
  });

  it("walks every request body media type", () => {
    const json = z.object({ json: z.string() });
    const form = z.object({ form: z.string() });
    const found = reachableObjects([
      route({
        request: {
          body: {
            content: {
              "application/json": { schema: json },
              "multipart/form-data": { schema: form },
            },
          },
        },
      }),
    ]);

    expect(found).toEqual(expect.arrayContaining([json, form]));
  });

  it("walks every documented response, not only the success one", () => {
    const ok = z.object({ ok: z.string() });
    const problem = z.object({ code: z.string() });
    const found = reachableObjects([
      route({
        responses: {
          200: { description: "OK", content: { "application/json": { schema: ok } } },
          409: { description: "Conflict", content: { "application/json": { schema: problem } } },
        },
      }),
    ]);

    expect(found).toEqual(expect.arrayContaining([ok, problem]));
  });

  it("terminates on a self-referential schema", () => {
    // `seen` is what stops the walk recursing forever. A tree node whose children are a lazy
    // self-reference is the realistic way that arises: `unwrapped` resolves the thunk back to
    // the node it started from, so without `seen` this recurses until the stack runs out.
    // The assertion is that the call returns at all, and reports the node exactly once.
    const node = z.object({
      name: z.string(),
      get children() {
        return z.array(node);
      },
    });
    const found = reachableObjects([route({ responses: jsonResponse(node) })]);

    expect(found.filter((schema) => schema === node)).toHaveLength(1);
  });

  it("ignores a response declared without content", () => {
    expect(reachableObjects([route({})])).toStrictEqual([]);
  });

  it("descends through an array of arrays and through a lazy schema", () => {
    // Both are reached by `unwrapped` rather than by a branch of `visit`, and both are bounded
    // by MAX_WRAPPER_DEPTH — an array of arrays spends two of the five iterations. Pinned here
    // so a Zod upgrade that stops giving `ZodArray` or `ZodLazy` an `unwrap()` fails loudly
    // instead of quietly ceasing to reach the schemas underneath.
    const grid = z.object({ cell: z.string() });
    const deferred = z.object({ later: z.string() });
    const found = reachableObjects([
      route({
        responses: jsonResponse(
          z.object({ grid: z.array(z.array(grid)), deferred: z.lazy(() => deferred) }),
        ),
      }),
    ]);

    expect(found).toEqual(expect.arrayContaining([grid, deferred]));
  });

  it("does not reach objects behind an intersection, a record or a tuple", () => {
    // The documented limitation, asserted rather than left as prose: these three combinators
    // have no branch, and nothing today uses them. The test is here so the limitation is
    // visible and so adding support is a deliberate change that updates this expectation —
    // not so the behaviour is desirable.
    const left = z.object({ a: z.string() });
    const right = z.object({ b: z.string() });
    const valued = z.object({ c: z.string() });
    const member = z.object({ d: z.string() });
    const found = reachableObjects([
      route({
        responses: jsonResponse(
          z.object({
            intersected: z.intersection(left, right),
            recorded: z.record(z.string(), valued),
            tupled: z.tuple([member]),
          }),
        ),
      }),
    ]);

    // Asserted one by one: `not.arrayContaining` is satisfied by a single absentee, so it
    // would still pass if three of the four had quietly become reachable.
    expect(found).not.toContain(left);
    expect(found).not.toContain(right);
    expect(found).not.toContain(valued);
    expect(found).not.toContain(member);
    // Not vacuous: the enclosing object itself is reached, so the walk did run.
    expect(found).toHaveLength(1);
  });
});

describe("schemasByComponentName", () => {
  it("keys each schema by the name it is emitted under, skipping anonymous ones", () => {
    const named = z.object({ value: z.string() }).openapi("SyntheticNamed");
    const anonymous = z.object({ value: z.string() });

    const byName = schemasByComponentName([named, anonymous]);

    expect(byName.get("SyntheticNamed")).toBe(named);
    expect([...byName.keys()]).toStrictEqual(["SyntheticNamed"]);
  });

  it("names a schema found only through an array element", () => {
    // The two halves joined: the walk reaches a DTO under an array, and the name recovery
    // then pairs it with the component `createContract` has to write defaults onto. Without
    // the array branch there is nothing to name.
    const item = z.object({ value: z.string() }).openapi("SyntheticArrayItem");
    const byName = schemasByComponentName(
      reachableObjects([route({ responses: jsonResponse(z.array(item)) })]),
    );

    expect(byName.get("SyntheticArrayItem")).toBe(item);
  });

  it("refuses two different schemas emitted under one component name", () => {
    const first = z.object({ a: z.string() }).openapi("SyntheticClash");
    const second = z.object({ b: z.string() }).openapi("SyntheticClash");

    expect(() => schemasByComponentName([first, second])).toThrow(/SyntheticClash/);
  });
});
