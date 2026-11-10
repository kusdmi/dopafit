import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { components } from '@/shared/api/schema';

import { ExerciseMedia } from './ExerciseMedia';

type ExerciseMediaOut = components['schemas']['ExerciseMediaOut'];

function media(
  partial: Partial<ExerciseMediaOut> & Pick<ExerciseMediaOut, 'kind'>,
): ExerciseMediaOut {
  return {
    id: partial.id ?? crypto.randomUUID(),
    position: partial.position ?? 0,
    url: partial.url ?? 'https://example.com/media',
    kind: partial.kind,
  };
}

describe('ExerciseMedia', () => {
  it('renders an iframe for an iframe kind item', () => {
    render(
      <ExerciseMedia
        media={[media({ kind: 'iframe', url: 'https://www.youtube.com/embed/abc' })]}
      />,
    );
    const frame = screen.getByTitle('Видео упражнения');
    expect(frame).toBeInTheDocument();
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'https://www.youtube.com/embed/abc');
  });

  it('renders an img for an image kind item', () => {
    const { container } = render(
      <ExerciseMedia media={[media({ kind: 'image', url: 'https://example.com/a.png' })]} />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/a.png');
  });

  it('explains a broken image instead of leaving an empty frame', () => {
    const { container } = render(<ExerciseMedia media={[media({ kind: 'image' })]} />);
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось загрузить медиа');
    expect(container.querySelector('img')).toBeNull();
  });

  it('sorts items by position', () => {
    const { container } = render(
      <ExerciseMedia
        media={[
          media({ kind: 'image', url: 'second', position: 2 }),
          media({ kind: 'image', url: 'first', position: 1 }),
        ]}
      />,
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs[0]).toHaveAttribute('src', 'first');
    expect(imgs[1]).toHaveAttribute('src', 'second');
  });

  it('renders a shared placeholder when media is empty and no imageUrl', () => {
    const { container } = render(<ExerciseMedia media={[]} />);
    expect(container).toHaveTextContent('Нет медиа');
  });

  it('renders the fallback img when media is empty but imageUrl is provided', () => {
    const { container } = render(
      <ExerciseMedia media={[]} imageUrl="https://example.com/fallback.png" />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/fallback.png');
  });
});
