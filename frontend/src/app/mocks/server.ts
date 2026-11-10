import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/** Node-side MSW for vitest: the same handlers as the dev browser worker. */
export const server = setupServer(...handlers);
