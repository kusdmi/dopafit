import { AppError } from "../../../domain/error.js";
import type { Profile, Settings } from "./ports.js";
export const normalizeContact = (contact: string): string =>
  contact.includes("@") ? contact.trim().toLowerCase() : contact.trim();
export const PASSWORD_PATTERN = /^(?=[\s\S]*[a-z])(?=[\s\S]*[A-Z])(?=[\s\S]*[0-9])[\s\S]*$/;
export const PASSWORD_REQUIREMENTS =
  "От 8 до 32 символов, включая заглавную и строчную латинские буквы и цифру";
export function validatePassword(value: string): void {
  if (value.length < 8 || value.length > 32 || !PASSWORD_PATTERN.test(value))
    throw new AppError("validation_error", PASSWORD_REQUIREMENTS, {
      reason: "invalid_new_password",
    });
}
export function validateContact(type: "email" | "phone", value: string): void {
  if (!(type === "email" ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/u : /^\+\d{10,15}$/u).test(value))
    throw new AppError("validation_error", `Invalid ${type} format`);
}
const periods = new Set(["30d", "90d", "180d", "365d", "custom"]);
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function sanitizeAnalytics(raw: Record<string, unknown>): Record<string, unknown> {
  if (!object(raw)) throw new AppError("validation_error", "analytics_config must be an object");
  if (!Number.isInteger(raw.version))
    throw new AppError("validation_error", "analytics_config.version must be an integer");
  if (!periods.has(String(raw.default_period)))
    throw new AppError("validation_error", "analytics_config.default_period is invalid");
  if (!Array.isArray(raw.charts))
    throw new AppError("validation_error", "analytics_config.charts must be a list");
  return {
    ...raw,
    charts: raw.charts.filter(
      (chart: unknown) =>
        object(chart) &&
        ["workouts", "anthropometry"].includes(String(chart.type)) &&
        (chart.period == null || periods.has(String(chart.period))) &&
        (chart.params === undefined || object(chart.params)),
    ),
  };
}
export const defaultProfile = (): Profile => ({
  full_name: "",
  first_name: "",
  last_name: null,
  middle_name: null,
  gender: null,
  birth_date: null,
  city: null,
  injuries: null,
  clients_per_month: null,
});
export const defaultSettings = (): Settings => ({
  theme: "system",
  notifications_enabled: true,
  analytics_config: null,
});
/**
 * A failure whose database writes must survive: the transaction commits, then the error is
 * rethrown to the caller.
 *
 * This exists for one case, and it is a security control. When a verification code is wrong,
 * the attempt counter is incremented and then the request fails. Thrown as an ordinary error,
 * that failure would roll the transaction back — taking the increment with it — so the
 * counter would never grow and the "too many attempts" limit would never trigger, leaving the
 * code open to brute force. `AuthApplication.run` is the other half: it catches this type,
 * lets the transaction commit, and rethrows outside it.
 *
 * Throw it only where a failure has to leave a trace behind. Any other error type is the
 * right choice when the write should be rolled back.
 */
export class PersistedAttemptError extends AppError {}

export function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/u);
  return {
    first_name: parts.length >= 3 ? parts[1] : parts[0],
    last_name: parts.length >= 3 ? parts[0] : (parts[1] ?? null),
    middle_name: parts.length >= 3 ? parts.slice(2).join(" ") : null,
  };
}
