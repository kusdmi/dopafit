import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders "Мой" for an active managed stub', () => {
    render(<StatusBadge status="active" managed />);
    expect(screen.getByText('Мой')).toBeInTheDocument();
  });

  it('renders "Активный" for an active linked client', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('Активный')).toBeInTheDocument();
  });

  it('renders "Неактивный" for archived/unlinked', () => {
    render(<StatusBadge status="archived" />);
    expect(screen.getByText('Неактивный')).toBeInTheDocument();
  });

  it('does not strike through the label', () => {
    render(<StatusBadge status="archived" />);
    const el = screen.getByText('Неактивный');
    expect(el.className).not.toMatch(/line-through/);
  });

  it('renders "Неактивный" for unlinked', () => {
    render(<StatusBadge status="unlinked" />);
    expect(screen.getByText('Неактивный')).toBeInTheDocument();
  });
});
