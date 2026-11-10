import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Logo } from './Logo';

it('renders the plate and arrow via tokens, not hardcoded hex', () => {
  const { container } = render(<Logo />);
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  const html = svg!.outerHTML;
  expect(html).not.toMatch(/#006FFD/i);
  expect(html).not.toMatch(/#FFF0E6/i);
  const plate = container.querySelector('rect');
  const arrow = container.querySelector('path[stroke], path[style*="stroke"]');
  expect(plate).not.toBeNull();
  expect(arrow).not.toBeNull();
});

it('keeps the wordmark on currentColor', () => {
  const { container } = render(<Logo className="text-content" />);
  const wordmark = container.querySelector('path[fill="currentColor"]');
  expect(wordmark).not.toBeNull();
});
