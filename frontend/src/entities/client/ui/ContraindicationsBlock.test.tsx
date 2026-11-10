import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { ContraindicationsBlock } from './ContraindicationsBlock';

it('renders injuries with a warning label', () => {
  render(<ContraindicationsBlock injuries="Грыжа L4-L5" />);
  expect(screen.getByText('Ограничения по здоровью')).toBeInTheDocument();
  expect(screen.getByText('Грыжа L4-L5')).toBeInTheDocument();
});

it('renders the trainer note when provided', () => {
  render(<ContraindicationsBlock injuries={null} note="Любит кардио" />);
  expect(screen.getByText('Примечание тренера')).toBeInTheDocument();
  expect(screen.getByText('Любит кардио')).toBeInTheDocument();
});

it('renders nothing when both fields are empty', () => {
  const { container } = render(<ContraindicationsBlock injuries={null} note={null} />);
  expect(container).toBeEmptyDOMElement();
});
