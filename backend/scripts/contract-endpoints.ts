import { allEndpoints, type EndpointDependencies } from "../src/http/endpoints/index.js";
import type { Applications } from "../src/modules/training/http/index.js";
import type { Endpoint } from "../src/endpoint.js";

/**
 * A stand-in for a service the contract export must never reach.
 *
 * Building the endpoint list only *closes over* the services: every handler is an arrow
 * function, and nothing here calls one. So the contract needs the shape of a service, never
 * its behaviour. Rather than hand over a typed `null` — which would fail silently, as an
 * undefined method read at some later point — this returns a Proxy that throws the moment any
 * property is touched, turning "the contract path started needing a real service" from a
 * mystery into a named error at the exact access.
 *
 * Kept in `scripts/` on purpose: nothing in `src/` may depend on it.
 */
function unreachableService<T extends object>(name: string): T {
  const refuse = (property: string | symbol): never => {
    throw new Error(
      `the contract export must not call into a service (read ${name}.${String(property)})`,
    );
  };

  return new Proxy(Object.create(null) as T, {
    get: (_target, property) => refuse(property),
    has: (_target, property) => refuse(property),
    apply: () => refuse("()"),
  });
}

/** The training sub-applications, each one its own unreachable stand-in. */
const unreachableTraining: Applications = {
  clients: unreachableService<Applications["clients"]>("training.clients"),
  catalog: unreachableService<Applications["catalog"]>("training.catalog"),
  programs: unreachableService<Applications["programs"]>("training.programs"),
  workouts: unreachableService<Applications["workouts"]>("training.workouts"),
  measurements: unreachableService<Applications["measurements"]>("training.measurements"),
  calendar: unreachableService<Applications["calendar"]>("training.calendar"),
  analytics: unreachableService<Applications["analytics"]>("training.analytics"),
};

/**
 * The same dependencies `createRuntime` passes, with every service replaced by a stand-in.
 *
 * Typed as `EndpointDependencies`, so the set of services the endpoint modules need is
 * checked here too: a module that starts needing a new one cannot be satisfied by silence.
 */
const unreachableDependencies: EndpointDependencies = {
  auth: unreachableService<EndpointDependencies["auth"]>("auth"),
  training: unreachableTraining,
  commerce: unreachableService<EndpointDependencies["commerce"]>("commerce"),
  // Read for its link fields only while handling a request, never while routes are built.
  commerceOptions: unreachableService<EndpointDependencies["commerceOptions"]>("commerceOptions"),
  messaging: unreachableService<EndpointDependencies["messaging"]>("messaging"),
};

/**
 * Every endpoint the API declares, assembled without a database, a provider or any config.
 *
 * The list itself comes from `allEndpoints` — the very function the composition root mounts —
 * so the contract cannot document an operation the server does not serve, nor miss one it
 * does. All this file contributes is the stand-in services; `EndpointDependencies` names only
 * types, so importing it pulls in no database or provider and `make contracts` still runs
 * with no Postgres.
 *
 * `createContract` reads only `endpoint.route`, so this is the whole contract input; the
 * handlers come along because a route and its handler are now one declaration, and they are
 * inert here. Used by `export-openapi.ts` and by `contract.test.ts`, which is what makes that
 * test the byte-for-byte proof that the exported document matches the committed one.
 */
export function contractEndpoints(): Endpoint[] {
  return allEndpoints(unreachableDependencies);
}
