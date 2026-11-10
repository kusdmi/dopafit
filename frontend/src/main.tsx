import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';


import { App } from '@/app/App';
import { env } from '@/shared/config/env';
import { setupZodRu } from '@/shared/lib/validation/zod-ru';

import '@/app/styles/index.css';

// Install the global Russian error map so all zod-backed forms show Russian
// validation text by default (per-field `message`s still take priority).
setupZodRu();

async function enableMocking(): Promise<void> {
  // `import.meta.env.DEV` is a build-time literal, so in a production build the
  // whole branch — and with it the `@/app/mocks/browser` import — becomes
  // statically dead and rolldown drops the MSW chunk instead of emitting it
  // (450 kB raw / 166 kB gzip that the service worker used to precache for
  // every user). It has to come FIRST in the condition: `env.apiMock` is a
  // runtime value, and with it leading the bundler cannot prove the branch is
  // unreachable. In dev the gate is unchanged — VITE_API_MOCK still decides.
  if (!import.meta.env.DEV || !env.apiMock) {
    return;
  }
  const { worker } = await import('@/app/mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

void enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
