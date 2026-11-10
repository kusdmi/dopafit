import { DEFAULT_MAX_BODY_BYTES, DEFAULT_MAX_MEDIA_BYTES } from "./limits.js";

const DEV_JWT_SECRET = "dev-only-secret-change-me-in-production-0000";
const DEV_S3_SECRET = "dopafit-minio";
const MAX_PORT = 65535;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 86400;

/** Token lifetimes and code-sending limits handed to the auth module. */
export interface AuthConfigValues {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  verificationCodeTtlSeconds: number;
  verificationTokenTtlSeconds: number;
  registrationTokenTtlSeconds: number;
  twoFactorTokenTtlSeconds: number;
  verificationDeadlineDays: number;
  codeSendMinIntervalSeconds: number;
  codeSendMaxPerContactHour: number;
  codeSendMaxPerContactDay: number;
  codeSendMaxPerIpHour: number;
}

/** S3/MinIO connection plus the limits applied when optimising uploaded images. */
export interface StorageConfigValues {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  maxDimension: number;
  jpegQuality: number;
}

/**
 * VAPID credentials for Web Push. Absent as a whole when the deployment has no keys: push
 * delivery is then simply not wired, which is a valid configuration rather than an error.
 */
export interface VapidConfigValues {
  publicKey: string;
  privateKey: string;
  /** Contact the push service may use to reach the operator, `mailto:` or `https:`. */
  subject: string;
}

export interface SmtpConfigValues {
  host: string;
  port: 465 | 587;
  user: string;
  password: string;
}

export interface CaptchaConfigValues {
  siteKey: string;
  secretKey: string;
  allowedHosts: string[];
}

export interface Config {
  production: boolean;
  jwtSecret: string;
  /** Fixed code accepted instead of a generated one. Refused in production unless opted in. */
  devVerificationCode: string | undefined;
  /** E2E-only deterministic code sequence, forbidden in production. */
  rotateDevVerificationCode: boolean;
  port: number;
  hostname: string;
  /** Only enable behind a trusted proxy — it makes X-Forwarded-For decide the client IP. */
  trustProxy: boolean;
  databaseUrl: string;
  databaseRootCertificate: string | undefined;
  publicDirectory: string;
  corsOrigins: string[];
  maxBodyBytes: number;
  maxMediaBytes: number;
  customExerciseLimit: number;
  subscriptionUrl: string;
  inviteUrl: string;
  schedulerIntervalSeconds: number;
  schedulerStaleRunHours: number;
  auth: AuthConfigValues;
  storage: StorageConfigValues;
  /** `undefined` when no key pair is configured — see `VapidConfigValues`. */
  vapid: VapidConfigValues | undefined;
  smtp: SmtpConfigValues | undefined;
  captcha: CaptchaConfigValues | undefined;
}

/**
 * Reads the configuration from the environment and validates it. Declaring the return type
 * explicitly keeps `Config` readable as documentation while `tsc` still checks it against
 * what is actually built below.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const value = (name: string, fallback: string) => env[`DOPAFIT_${name}`] ?? fallback;

  const integer = (name: string, fallback: number, minimum = 1) => {
    const result = Number(value(name, String(fallback)));
    if (!Number.isSafeInteger(result) || result < minimum)
      throw new Error(`Invalid DOPAFIT_${name}`);
    return result;
  };

  const boolean = (name: string, fallback = false) => {
    const result = value(name, String(fallback)).toLowerCase();
    if (!["true", "false", "1", "0"].includes(result)) throw new Error(`Invalid DOPAFIT_${name}`);
    return result === "true" || result === "1";
  };

  /**
   * Normalises a URL-ish value into an absolute endpoint URL. A bare `host:port` gets `http://`
   * filled in, so a deployment that needs TLS spells the scheme out in the variable itself.
   * The trailing slash is stripped, because these endpoints are concatenated with object keys.
   */
  const endpointUrl = (name: string, fallback: string) => {
    const raw = value(name, fallback);
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    // Credentials in the endpoint would be logged with every request URL.
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
      throw new Error(`Invalid DOPAFIT_${name}`);
    return url.toString().replace(/\/$/, "");
  };

  const production = ["prod", "production"].includes(value("ENVIRONMENT", "dev").toLowerCase());
  const jwtSecret = value("JWT_SECRET", DEV_JWT_SECRET);
  const devVerificationCode = value("DEV_VERIFICATION_CODE", "000000").trim() || undefined;
  const rotateDevVerificationCode = boolean("E2E_ROTATING_VERIFICATION_CODE");
  const s3Secret = value("S3_SECRET_KEY", DEV_S3_SECRET);
  const notificationProvider = value("NOTIFICATION_PROVIDER", "logging");
  if (!["logging", "smtp"].includes(notificationProvider))
    throw new Error("Unsupported DOPAFIT_NOTIFICATION_PROVIDER");

  let smtp: SmtpConfigValues | undefined;
  if (notificationProvider === "smtp") {
    const host = value("SMTP_HOST", "").trim();
    const user = value("SMTP_USER", "auth@dopafit.ru").trim();
    const password = value("SMTP_PASSWORD", "");
    const smtpPort = integer("SMTP_PORT", 587);
    if (!host || /[\s/:@]/.test(host)) throw new Error("Invalid DOPAFIT_SMTP_HOST");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) throw new Error("Invalid DOPAFIT_SMTP_USER");
    if (!password) throw new Error("Missing DOPAFIT_SMTP_PASSWORD");
    if (smtpPort !== 465 && smtpPort !== 587) throw new Error("Invalid DOPAFIT_SMTP_PORT");
    if (devVerificationCode)
      throw new Error("SMTP requires empty DOPAFIT_DEV_VERIFICATION_CODE (random codes)");
    smtp = { host, port: smtpPort, user, password };
  }

  const captchaSecret = value("SMARTCAPTCHA_SECRET_KEY", "").trim();
  const captchaSite = value("SMARTCAPTCHA_SITE_KEY", "").trim();
  if (captchaSite && !captchaSecret) throw new Error("Missing DOPAFIT_SMARTCAPTCHA_SECRET_KEY");
  const allowedHosts = value(
    "SMARTCAPTCHA_ALLOWED_HOSTS",
    production ? "app.dopafit.ru" : "localhost",
  )
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  if (
    captchaSecret &&
    (!allowedHosts.length || allowedHosts.some((host) => !/^[a-z0-9.-]+$/i.test(host)))
  )
    throw new Error("Invalid DOPAFIT_SMARTCAPTCHA_ALLOWED_HOSTS");
  const captcha = captchaSecret
    ? {
        secretKey: captchaSecret,
        siteKey: captchaSite || "ysc1_6awhCKX7VRAK4f1ph7Qvv8RWxyVP7rmp1dEojEpx6b2c5d53",
        allowedHosts,
      }
    : undefined;

  if (rotateDevVerificationCode && (production || devVerificationCode !== "000000"))
    throw new Error("DOPAFIT_E2E_ROTATING_VERIFICATION_CODE requires development and code 000000");

  if (value("PAYMENT_PROVIDER", "mock") !== "mock")
    throw new Error("Unsupported DOPAFIT_PAYMENT_PROVIDER");

  if (production) {
    // Every development default that would be a hole in production, reported at once so a
    // deployment fails on the whole list rather than one variable per restart.
    const insecure = [
      (jwtSecret === DEV_JWT_SECRET || jwtSecret.length < 32) && "DOPAFIT_JWT_SECRET",
      !env.DOPAFIT_DATABASE_URL && "DOPAFIT_DATABASE_URL",
      devVerificationCode &&
        !boolean("ALLOW_FIXED_VERIFICATION_CODE") &&
        "DOPAFIT_DEV_VERIFICATION_CODE",
      (!s3Secret || s3Secret === DEV_S3_SECRET) && "DOPAFIT_S3_SECRET_KEY",
      !smtp && !boolean("ALLOW_UNDELIVERED_NOTIFICATIONS") && "DOPAFIT_NOTIFICATION_PROVIDER",
    ].filter(Boolean);
    if (insecure.length)
      throw new Error(`Insecure production configuration: ${insecure.join(", ")}`);
  }

  let origins: unknown;
  try {
    origins = JSON.parse(value("CORS_ORIGINS", '["http://localhost:5173"]'));
  } catch {
    throw new Error("Invalid DOPAFIT_CORS_ORIGINS");
  }
  if (
    !Array.isArray(origins) ||
    !origins.every((origin) => typeof origin === "string" && /^https?:\/\//.test(origin))
  )
    throw new Error("Invalid DOPAFIT_CORS_ORIGINS");

  const port = integer("PORT", 8000);
  if (port > MAX_PORT) throw new Error("Invalid DOPAFIT_PORT");

  // Web Push is optional in development: with no keys the delivery port keeps its no-op
  // stand-in and the app runs exactly as before. Half a pair is not a configuration
  // though, it is a typo — it would start an instance that registers subscriptions and
  // then never sends to them.
  const vapidPublicKey = value("VAPID_PUBLIC_KEY", "").trim();
  const vapidPrivateKey = value("VAPID_PRIVATE_KEY", "").trim();
  const vapidSubject = value("VAPID_SUBJECT", "").trim();
  if (Boolean(vapidPublicKey) !== Boolean(vapidPrivateKey))
    throw new Error("DOPAFIT_VAPID_PUBLIC_KEY and DOPAFIT_VAPID_PRIVATE_KEY must be set together");
  // In production notifications are part of the product, and the failure mode is silent:
  // the frontend hides the button, so nobody notices push is off until someone asks why
  // they get no reminders. Refuse the start instead, the way every other secret does.
  if (production && !vapidPublicKey)
    throw new Error(
      "Insecure production configuration: DOPAFIT_VAPID_PUBLIC_KEY, DOPAFIT_VAPID_PRIVATE_KEY",
    );
  if (vapidPublicKey && !/^(mailto:|https:\/\/)/.test(vapidSubject))
    throw new Error("Invalid DOPAFIT_VAPID_SUBJECT: expected a mailto: or https:// contact");

  return {
    production,
    smtp,
    captcha,
    jwtSecret,
    devVerificationCode,
    rotateDevVerificationCode,
    port,
    hostname: value("HOST", "0.0.0.0"),
    trustProxy: boolean("TRUST_PROXY"),
    databaseUrl: value("DATABASE_URL", "postgresql://dopafit:dopafit@postgres:5432/dopafit_hono"),
    databaseRootCertificate: value("DATABASE_SSL_ROOT_CERT", "") || undefined,
    publicDirectory: value("PUBLIC_DIRECTORY", "/app/public"),
    corsOrigins: origins as string[],
    maxBodyBytes: integer("MAX_REQUEST_BODY_BYTES", DEFAULT_MAX_BODY_BYTES),
    maxMediaBytes: integer("MAX_MEDIA_UPLOAD_BYTES", DEFAULT_MAX_MEDIA_BYTES),
    customExerciseLimit: integer("CUSTOM_EXERCISE_LIMIT_DEFAULT", 10, 0),
    subscriptionUrl: value("SUBSCRIPTION_EXTERNAL_URL", "https://app.dopafit.ru/subscription"),
    inviteUrl: value("INVITE_BASE_URL", "https://dopafit.app"),
    schedulerIntervalSeconds: integer("SCHEDULER_INTERVAL_SECONDS", 300),
    schedulerStaleRunHours: integer("SCHEDULER_STALE_RUN_HOURS", 1),
    auth: {
      accessTokenTtlSeconds: integer("ACCESS_TOKEN_TTL_MINUTES", 15) * SECONDS_PER_MINUTE,
      refreshTokenTtlSeconds: integer("REFRESH_TOKEN_TTL_DAYS", 30) * SECONDS_PER_DAY,
      verificationCodeTtlSeconds: integer("VERIFICATION_CODE_TTL_MINUTES", 10) * SECONDS_PER_MINUTE,
      verificationTokenTtlSeconds:
        integer("VERIFICATION_TOKEN_TTL_MINUTES", 15) * SECONDS_PER_MINUTE,
      registrationTokenTtlSeconds:
        integer("REGISTRATION_TOKEN_TTL_MINUTES", 30) * SECONDS_PER_MINUTE,
      twoFactorTokenTtlSeconds: integer("TWO_FACTOR_TOKEN_TTL_MINUTES", 5) * SECONDS_PER_MINUTE,
      verificationDeadlineDays: integer("VERIFICATION_DEADLINE_DAYS", 90),
      codeSendMinIntervalSeconds: integer("CODE_SEND_MIN_INTERVAL_SECONDS", 60, 0),
      codeSendMaxPerContactHour: integer("CODE_SEND_MAX_PER_CONTACT_HOUR", 5),
      codeSendMaxPerContactDay: integer("CODE_SEND_MAX_PER_CONTACT_DAY", 10),
      codeSendMaxPerIpHour: integer("CODE_SEND_MAX_PER_IP_HOUR", 20),
    },
    storage: {
      endpoint: endpointUrl("S3_ENDPOINT", "http://minio:9000"),
      publicEndpoint: endpointUrl("S3_PUBLIC_ENDPOINT", "http://localhost:9000"),
      region: value("S3_REGION", "us-east-1"),
      bucket: value("S3_BUCKET", "measurements"),
      accessKey: value("S3_ACCESS_KEY", "dopafit"),
      secretKey: s3Secret,
      maxDimension: integer("IMAGE_MAX_DIMENSION", 1600),
      jpegQuality: integer("IMAGE_JPEG_QUALITY", 80),
    },
    vapid: vapidPublicKey
      ? { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidSubject }
      : undefined,
  };
}
