import type * as M from "../domain/models/index.js";

/** Photo URLs point to the authenticated API, never to a transferable storage signature. */
export const privatePhotoUrl = (measurementId: string, kind: M.PhotoKind): string =>
  `/api/v1/measurements/${measurementId}/photos/${kind}/content`;
