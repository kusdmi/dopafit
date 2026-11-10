import { request } from '@playwright/test';
import { readFileSync } from 'node:fs';

import type { Session } from './accounts.ts';

/** A valid repository image; the server decodes and optimizes uploaded bytes. */
const PNG = readFileSync(new URL('../../frontend/public/icons/favicon-32x32.png', import.meta.url));

export function testPhoto(name = 'progress.png'): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  return { name, mimeType: 'image/png', buffer: PNG };
}

/** Prepare a photo through the same public multipart API used by the browser. */
export async function uploadPhoto(
  session: Session,
  measurementId: string,
  kind: 'front' | 'back' | 'left' | 'right',
): Promise<void> {
  const context = await request.newContext({
    baseURL: process.env.E2E_API_URL ?? 'http://backend-e2e:8000',
  });
  try {
    const response = await context.post(`/api/v1/measurements/${measurementId}/photos`, {
      headers: { Authorization: `Bearer ${session.tokens.access_token}` },
      multipart: { kind, file: testPhoto() },
    });
    if (response.status() !== 201) {
      throw new Error(`Prepare photo failed: HTTP ${response.status()} — ${await response.text()}`);
    }
  } finally {
    await context.dispose();
  }
}

/** Give an exercise an image through the public API for media-loading scenarios. */
export async function uploadExerciseImage(session: Session, exerciseId: string): Promise<void> {
  const context = await request.newContext({
    baseURL: process.env.E2E_API_URL ?? 'http://backend-e2e:8000',
  });
  try {
    const response = await context.post(`/api/v1/exercises/${exerciseId}/media`, {
      headers: { Authorization: `Bearer ${session.tokens.access_token}` },
      multipart: { kind: 'image', file: testPhoto('exercise.png') },
    });
    if (response.status() !== 201) {
      throw new Error(
        `Prepare exercise image failed: HTTP ${response.status()} — ${await response.text()}`,
      );
    }
  } finally {
    await context.dispose();
  }
}
