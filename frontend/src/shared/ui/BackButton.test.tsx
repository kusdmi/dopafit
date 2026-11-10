import { AppFrame, Toolbar } from '@/shared/ui/primitives';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { BackButton } from './BackButton';

// Проверяем, что кнопка обёрнута именно в контейнер ToolbarActions со
// slot="start": ищем элемент со slot="start", содержащий кнопку «Назад».
// Так тест по-настоящему проверяет обёртку, а не пустую истину.
it('renders the back button inside ToolbarActions slot=start', () => {
  const { container } = render(
    <AppFrame>
      <MemoryRouter>
        <Toolbar>
          <BackButton to="/clients" />
        </Toolbar>
      </MemoryRouter>
    </AppFrame>,
  );
  const buttons = container.querySelector('.toolbar-actions--start');
  expect(buttons).not.toBeNull();
  expect(buttons?.querySelector('button[aria-label="Назад"]')).not.toBeNull();
});
