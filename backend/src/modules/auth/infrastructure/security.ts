import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { compare } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type { Security } from "../domain/ports.js";
const scryptAsync = promisify(scrypt);
const dummyBcryptHash = "$2b$12$JyhySnk6bhqyEpyTDk5lsOJZOmWJJzF7OLwHlVrZuxmVVe7aiKiFi";
export class CryptoSecurity implements Security {
  private readonly key: Uint8Array;
  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }
  id(): string {
    return randomUUID();
  }
  randomCode(): string {
    return randomInt(1000000).toString().padStart(6, "0");
  }
  randomToken(): string {
    return randomBytes(48).toString("base64url");
  }
  referralCode(): string {
    return randomBytes(4).toString("hex").toUpperCase();
  }
  hashToken(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const hash = (await scryptAsync(password, salt, 64)) as Buffer;
    return `scrypt$${salt}$${hash.toString("hex")}`;
  }
  async verifyPassword(password: string, hash: string | null): Promise<boolean> {
    // Both algorithms run for all accounts while legacy bcrypt hashes coexist
    // with scrypt. Missing contacts must not bypass the more expensive work.
    const legacy = hash?.startsWith("$2") ?? false;
    const bcryptValid = await compare(password, legacy ? hash! : dummyBcryptHash);
    const [kind, salt, encoded] = hash?.split("$") ?? [];
    const valid = kind === "scrypt" && !!salt && !!encoded && /^[0-9a-f]{128}$/u.test(encoded);
    const computed = (await scryptAsync(
      password,
      valid ? salt : "00000000000000000000000000000000",
      64,
    )) as Buffer;
    const expected = valid ? Buffer.from(encoded, "hex") : Buffer.alloc(64);
    const scryptValid = timingSafeEqual(computed, expected) && !!valid;
    return legacy ? bcryptValid : scryptValid;
  }
  async sign(type: string, payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
    return new SignJWT({ ...payload, type })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
      .sign(this.key);
  }
  async decode(token: string, type: string): Promise<Record<string, unknown> | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
      });
      return payload.type === type ? payload : null;
    } catch {
      return null;
    }
  }
}
