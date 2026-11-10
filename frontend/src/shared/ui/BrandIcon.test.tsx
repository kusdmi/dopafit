import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { BrandIcon } from './BrandIcon';

it('renders the plate and arrow via tokens (no hardcoded hex)', () => {
  const { container } = render(<BrandIcon />);
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  expect(container.querySelector('rect')).not.toBeNull();
  expect(container.querySelector('path[style*="stroke"]')).not.toBeNull();
  expect(svg!.outerHTML).not.toMatch(/#006FFD/i);
  expect(svg!.outerHTML).not.toMatch(/#FFF0E6/i);
});

it('applies a soft drop shadow', () => {
  const { container } = render(<BrandIcon />);
  const svg = container.querySelector('svg');
  expect(svg?.getAttribute('style') ?? '').toMatch(/drop-shadow/);
});
