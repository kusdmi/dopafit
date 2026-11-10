import { render } from '@testing-library/react';
import { expect, it } from 'vitest';

import { BrandWordmark } from './BrandWordmark';

it('renders the DopaFit letters as a currentColor path', () => {
  const { container } = render(<BrandWordmark className="text-content" />);
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  expect(container.querySelector('path[fill="currentColor"]')).not.toBeNull();
  expect(svg!.getAttribute('aria-label')).toBe('DopaFit');
});
