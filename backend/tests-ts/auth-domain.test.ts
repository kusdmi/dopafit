import { describe, expect, it } from "vitest";
import {
  normalizeContact,
  validatePassword,
  sanitizeAnalytics,
} from "../src/modules/auth/domain/rules.js";

describe("auth policies", () => {
  it("normalizes emails while retaining phone format", () => {
    expect(normalizeContact("  Person@EXAMPLE.COM ")).toBe("person@example.com");
    expect(normalizeContact(" +79991234567 ")).toBe("+79991234567");
  });
  it("requires Latin letters for new passwords and permits additional characters", () => {
    expect(() => validatePassword("weakpassword")).toThrow();
    expect(() => validatePassword("Пароль123")).toThrow();
    expect(() => validatePassword("Strong1!пароль")).not.toThrow();
    expect(() => validatePassword("Aa1" + "a".repeat(29))).not.toThrow();
    expect(() => validatePassword("Aa1" + "a".repeat(30))).toThrow();
    for (const password of ["Aa12345", "strong123", "STRONG123", "StrongPassword"]) {
      expect(() => validatePassword(password)).toThrow();
    }
  });
  it("preserves future config fields while dropping unknown or malformed charts", () => {
    expect(
      sanitizeAnalytics({
        version: 1,
        default_period: "90d",
        future: true,
        charts: [
          { type: "workouts" },
          { type: "future" },
          { type: "anthropometry", params: [] },
          { type: "workouts", period: "invalid" },
        ],
      }),
    ).toEqual({
      version: 1,
      default_period: "90d",
      future: true,
      charts: [{ type: "workouts" }],
    });
    expect(() => sanitizeAnalytics({ version: true, default_period: "90d", charts: [] })).toThrow();
  });
});
