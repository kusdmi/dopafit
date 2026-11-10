/**
 * Routes for the e2e suite — a RE-EXPORT of the application's own route table,
 * never a copy of it. `frontend/src/shared/config/paths.ts` says string literals
 * for routes are allowed there and only there, and that tests must import from
 * it; a second list would drift silently the first time a route moves.
 *
 * The file imports nothing itself, so pulling it across the package boundary
 * costs no frontend runtime and no build step.
 */
export {
  paths,
  program,
  programEdit,
  programShare,
  programStart,
  programSession,
  workoutSummary,
  exercise,
  connectionEdit,
  connectionMeasurements,
  supportThread,
} from '../../frontend/src/shared/config/paths.ts';
