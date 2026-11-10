import { z } from "@hono/zod-openapi";
import * as s from "./schemas.js";
import { requirePrincipal, type EndpointInput } from "../../../endpoint.js";
import type * as M from "../domain/models/index.js";

/** The caller as this module's domain sees them. */
export function actor(i: EndpointInput): M.Actor {
  const { id, role } = requirePrincipal(i);
  return { id, role };
}
export const nullableString = (value: unknown) => (value == null ? null : z.string().parse(value));
export const number = (value: unknown, fallback: number) =>
  value == null ? fallback : z.coerce.number().parse(value);
export const boolean = (value: unknown, fallback = false) =>
  value == null
    ? fallback
    : z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).parse(value);
export const id = (i: EndpointInput, key: string) => z.string().uuid().parse(i.params[key]);
export const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/);
export const photoUpload = z.object({ kind: s.PhotoKind, file: z.instanceof(File) });
export const mediaUpload = z.object({ kind: s.ExerciseMediaKind, file: z.instanceof(File) });
