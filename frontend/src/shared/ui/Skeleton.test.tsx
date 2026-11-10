import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from './Skeleton';

// SkeletonBlock не мокается в jsdom, поэтому тесты ассертят host-элементы
// по data-атрибутам (data-skeleton-row/card/field), не трогая внутренности ion-компонента.
describe('Skeleton', () => {
  it('renders the requested number of list rows', () => {
    const { container } = render(<Skeleton variant="list" count={3} />);
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(3);
  });

  it('renders a single card placeholder', () => {
    const { container } = render(<Skeleton variant="card" />);
    expect(container.querySelectorAll('[data-skeleton-card]')).toHaveLength(1);
  });

  it('renders form field placeholders', () => {
    const { container } = render(<Skeleton variant="form" count={2} />);
    expect(container.querySelectorAll('[data-skeleton-field]')).toHaveLength(2);
  });
});
