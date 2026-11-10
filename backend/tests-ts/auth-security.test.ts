import { describe, expect, it, vi } from "vitest";
import { compare, hash } from "bcryptjs";
vi.mock("bcryptjs", { spy: true });
import { CryptoSecurity } from "../src/modules/auth/infrastructure/security.js";

describe("authentication secrets", () => {
  const security = new CryptoSecurity("test-secret-that-is-not-a-production-secret");
  it("salts passwords and rejects invalid secrets", async () => {
    const first = await security.hashPassword("StrongPass1");
    const second = await security.hashPassword("StrongPass1");
    expect(first).not.toBe(second);
    expect(await security.verifyPassword("StrongPass1", first)).toBe(true);
    expect(await security.verifyPassword("wrong", first)).toBe(false);
    expect(await security.verifyPassword("wrong", null)).toBe(false);
  });
  it("enforces token purpose and expiry", async () => {
    const token = await security.sign("registration", { sub: "some-user" }, 1800);
    expect(await security.decode(token, "access")).toBeNull();
    expect((await security.decode(token, "registration"))?.sub).toBe("some-user");
    const expired = await security.sign("access", { sub: "some-user" }, -1);
    expect(await security.decode(expired, "access")).toBeNull();
  });
});

it("spends legacy verification work on unknown accounts as well as migrated accounts", async () => {
  const security = new CryptoSecurity("test-secret");
  vi.mocked(compare).mockClear();
  expect(await security.verifyPassword("bad", null)).toBe(false);
  expect(compare).toHaveBeenCalledOnce();
  const legacy = await hash("LegacyPassword1", 12);
  expect(await security.verifyPassword("LegacyPassword1", legacy)).toBe(true);
  expect(await security.verifyPassword("bad", legacy)).toBe(false);
});
