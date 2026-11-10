const BYTES_PER_MIB = 1024 * 1024;

/**
 * Request size limits, as one definition.
 *
 * These are fallbacks: `loadConfig` reads the real values from the environment and passes
 * them down, so in a running server these apply only where a component is built directly —
 * tests, mostly. They live here because they were previously written out three times, and had
 * drifted: the HTTP layer defaulted media uploads to 25 MiB while the config and the training
 * module both said 50, so a test-built API silently enforced half the documented limit.
 *
 * They sit at the top level rather than under `http/` because they describe request sizes,
 * not the adapter: `config.ts` and the training module both need them, and neither may
 * depend on the HTTP layer.
 */
export const DEFAULT_MAX_BODY_BYTES = 2 * BYTES_PER_MIB;
export const DEFAULT_MAX_MEDIA_BYTES = 50 * BYTES_PER_MIB;
