import type { Endpoint } from "../../../endpoint.js";
import type { ClientApplication } from "../application/clients.js";
import type { CatalogApplication } from "../application/catalog.js";
import type { ProgramApplication } from "../application/programs.js";
import type { WorkoutApplication } from "../application/workouts.js";
import type { MeasurementApplication } from "../application/measurements.js";
import type { CalendarApplication } from "../application/calendar.js";
import type { AnalyticsApplication } from "../application/analytics.js";
import { clientsEndpoints } from "./clients.js";
import { catalogEndpoints } from "./catalog.js";
import { programsEndpoints } from "./programs.js";
import { workoutsEndpoints } from "./workouts.js";
import { measurementsEndpoints } from "./measurements.js";
import { calendarEndpoints } from "./calendar.js";
import { analyticsEndpoints } from "./analytics.js";

export interface Applications {
  clients: ClientApplication;
  catalog: CatalogApplication;
  programs: ProgramApplication;
  workouts: WorkoutApplication;
  measurements: MeasurementApplication;
  calendar: CalendarApplication;
  analytics: AnalyticsApplication;
}

/**
 * Every training operation, by composing each sub-domain's own declarations.
 *
 * Split across files for the same reason the module's applications are: fifty operations in
 * one file reads as a wall. `createApi` sorts what it is given, so the order here carries no
 * meaning for the contract.
 */
export function trainingEndpoints(applications: Applications): Endpoint[] {
  return [
    ...clientsEndpoints(applications.clients),
    ...catalogEndpoints(applications.catalog),
    ...programsEndpoints(applications.programs),
    ...workoutsEndpoints(applications.workouts),
    ...measurementsEndpoints(applications.measurements),
    ...calendarEndpoints(applications.calendar),
    ...analyticsEndpoints(applications.analytics),
  ];
}
