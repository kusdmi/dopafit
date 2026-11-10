import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createContract, inRegistrationOrder } from "../src/http/app.js";
import { reachableObjects, schemasByComponentName } from "../src/http/schema-discovery.js";
import { contractEndpoints } from "../scripts/contract-endpoints.js";

/**
 * The committed contract is generated from the endpoint declarations each module makes
 * under `<module>/http/`, and CI fails when
 * regenerating it produces a diff. These tests bring that check forward: they run in
 * milliseconds without Docker or Postgres, so a drift surfaces during `make be-test`
 * rather than after a push.
 */

const contractPath = fileURLToPath(new URL("../../contracts/openapi.json", import.meta.url));

/** The routes the contract is built from, in the order `createContract` registers them. */
const routes = () => inRegistrationOrder(contractEndpoints()).map((endpoint) => endpoint.route);

/** Byte-for-byte identical to what `scripts/export-openapi.ts` writes. */
function serializeContract(): string {
  return `${JSON.stringify(createContract(contractEndpoints()), null, 2)}\n`;
}

describe("contract", () => {
  it("matches the committed openapi.json byte for byte", async () => {
    const committed = await readFile(contractPath, "utf8");

    // Compared as text, not as parsed objects: `components.schemas` is emitted in route
    // registration order, so a reordering of `routes` leaves the parsed documents deeply
    // equal while still producing the 291 KB diff that breaks CI and the frontend types.
    expect(serializeContract()).toBe(committed);
  });

  it("publishes a usable password pattern and the same 8–32 limits for all new-password requests", () => {
    const contract = createContract(contractEndpoints());
    for (const [name, field] of [
      ["SetPasswordRequest", "password"],
      ["ChangePasswordRequest", "new_password"],
      ["PasswordResetConfirmRequest", "new_password"],
    ]) {
      const schema = contract.components?.schemas?.[name];
      if (!schema || !("properties" in schema)) throw new Error("Missing password request schema");
      const password = schema.properties?.[field];
      if (!password || !("pattern" in password) || !password.pattern)
        throw new Error("Missing password pattern");
      expect(password).toMatchObject({ minLength: 8, maxLength: 32 });
      const pattern = new RegExp(password.pattern);
      expect(pattern.test("StrongPass1!")).toBe(true);
      for (const value of ["Пароль123", "lowercase1", "UPPERCASE1", "NoDigitsHere"])
        expect(pattern.test(value)).toBe(false);
    }
  });

  it("keeps routes ordered by path and method", () => {
    // The emitted order of `components.schemas` follows registration order, which
    // `inRegistrationOrder` derives by sorting on path and method. Sorting is what makes
    // splitting the declarations across modules safe: the registration order stays
    // reproducible no matter how they are laid out on disk, or in what order the composition
    // root lists the modules. Asserted here on the assembled list rather than inside
    // `createContract`, so a change to the sort shows up as a failing expectation.
    const keys = routes().map((route) => `${route.path} ${route.method}`);

    expect(keys).toStrictEqual([...keys].sort());
  });

  it("declares every operationId exactly once", () => {
    const operationIds = routes().map((route) => route.operationId);
    const duplicates = operationIds.filter((id, index) => operationIds.indexOf(id) !== index);

    expect(duplicates).toStrictEqual([]);
    expect(operationIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("types every body handler from the schema its route documents", () => {
    // The `body` field of a declaration asserts the type of a value `createApi` has already
    // parsed; it does not re-validate. That is only sound while the schema typing the handler
    // is the very one the route is documented and parsed with.
    //
    // `endpoint` now builds both from that single field, so the two are the same object by
    // construction rather than by convention — which is the stronger form of the property the
    // previous pair of `JsonBody` arguments could only be asserted into. Still checked here,
    // by the same reference identity as before: `endpoint.bodySchema` is the schema that typed
    // the handler and `route.request.body.content["application/json"].schema` is the one the
    // route documents, and the assertion is what would catch `endpoint` being changed to
    // route them apart.
    const endpoints = contractEndpoints();
    const documented = (endpoint: (typeof endpoints)[number]) => {
      const media = endpoint.route.request?.body?.content?.["application/json"];
      return media && "schema" in media ? media.schema : undefined;
    };
    const mismatches = endpoints
      .filter((endpoint) => endpoint.bodySchema && endpoint.bodySchema !== documented(endpoint))
      .map((endpoint) => endpoint.route.operationId);

    expect(mismatches).toStrictEqual([]);

    // Guards against the filter above being vacuous: most operations do take a JSON body,
    // and a refactor that stopped recording it would otherwise make this test pass empty.
    expect(endpoints.filter((endpoint) => endpoint.bodySchema).length).toBeGreaterThan(40);
  });

  it("declares a handler body for every route that documents a JSON one", () => {
    // The other half of the property above: a route documenting a JSON body whose handler
    // did not take it would read `input.body` as `unknown` and go on to parse it a second
    // time. The two multipart uploads are the exception — they take a form, not JSON, and
    // parse it themselves.
    const untyped = contractEndpoints()
      .filter(
        (endpoint) =>
          !endpoint.bodySchema && endpoint.route.request?.body?.content?.["application/json"],
      )
      .map((endpoint) => endpoint.route.operationId);

    expect(untyped).toStrictEqual([]);
  });

  it("keeps the default success status first among the 2xx responses", () => {
    // `createApi` derives the default success status from the first 2xx key of `responses`,
    // so key order is load-bearing. Three idempotent upserts legitimately document both
    // 200 and 201 and pick between them at runtime via `endpointResponse`; for those, 200
    // must stay first so the default matches the "already existed" branch. Everything else
    // documents a single success status.
    const offenders = routes()
      .map((route) => ({
        operationId: route.operationId,
        success: Object.keys(route.responses).filter((status) => status.startsWith("2")),
      }))
      .filter(
        ({ success }) =>
          success.length !== 1 &&
          !(success.length === 2 && success[0] === "200" && success[1] === "201"),
      );

    expect(offenders).toStrictEqual([]);
  });

  it("reaches every emitted object component by walking the routes", () => {
    // `createContract` writes the `default` values that `zod-openapi` drops back onto the
    // emitted components, and it finds the schemas to write them onto by walking the routes
    // rather than by importing the file the DTOs live in — which is what lets them move into
    // their own modules.
    //
    // The byte-for-byte test above only covers the one property that is actually restored
    // today (`ProgramCreate.kind`), and that schema is a top-level request body. So it would
    // stay green if the walk stopped descending into nested schemas, and the coupling would
    // reappear the moment a nested DTO grew a default. This asserts the stronger property the
    // walk is there for: every object component the document emits is reached and named.
    //
    // Its limits, since it is the test the walk's comments point at. It only sees schemas the
    // document emits as named object components: a non-object schema the walk misses — an enum
    // with a default reachable only through an unhandled combinator — is emitted and missed
    // with this green. And it holds no individual branch of the walk, because the real
    // declarations reach most DTOs several ways over; disabling array descent, or the params,
    // query or headers arm, leaves every test in this file passing. Those are held one by one
    // in `schema-discovery.test.ts`, on synthetic routes.
    const document = createContract(contractEndpoints());
    const emitted = Object.entries(document.components?.schemas ?? {})
      .filter(([, schema]) => "properties" in schema)
      .map(([name]) => name);

    const discovered = schemasByComponentName(reachableObjects(routes()));
    const unreached = emitted.filter((name) => !discovered.has(name));

    expect(unreached).toStrictEqual([]);
    // Guards against the filter being vacuous if the document ever came back empty.
    expect(emitted.length).toBeGreaterThan(100);
  });
});
