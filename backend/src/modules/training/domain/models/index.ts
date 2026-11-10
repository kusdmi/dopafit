// Barrel for the training domain models, split by sub-domain.
// Plain `export *` is safe here: this is a pure type barrel and there are no
// name collisions between the sub-domain files (verified against the
// original single-file domain/models.ts).
export * from "./shared.js";
export * from "./clients.js";
export * from "./catalog.js";
export * from "./programs.js";
export * from "./workouts.js";
export * from "./measurements.js";
export * from "./calendar.js";
