import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation, type Location } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { paths } from '@/shared/config/paths';
import { useNavigation } from '@/shared/lib/navigation';
import { TabShell } from './TabShell';

function Screen({ title, later }: { title: string; later: Promise<void> }) {
  const [value, setValue] = useState('');
  const navigation = useNavigation();
  return (
    <main>
      <h1>{title}</h1>
      <input
        aria-label="Черновик"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button onClick={() => navigation.push(paths.programNew)}>Создать программу</button>
      <button onClick={() => navigation.goBack()}>Назад</button>
      <button
        onClick={() => {
          void later.then(() => navigation.push(paths.programs));
        }}
      >
        Сохранить позже
      </button>
    </main>
  );
}
function BrowserAddress() {
  return <output aria-label="Адрес">{useLocation().pathname}</output>;
}
function renderShell(initial: string, later = Promise.resolve()) {
  const renderScreen = (location: Location) => (
    <Routes location={location}>
      <Route path={paths.home} element={<Screen title="Начало" later={later} />} />
      <Route path={paths.measurements} element={<Screen title="Замеры" later={later} />} />
      <Route path={paths.programs} element={<Screen title="Программы" later={later} />} />
      <Route path={paths.programNew} element={<Screen title="Новая программа" later={later} />} />
    </Routes>
  );
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <TabShell renderScreen={renderScreen} />
      <BrowserAddress />
    </MemoryRouter>,
  );
}

it('restores the previous screen and its parent without resetting either draft', async () => {
  const user = userEvent.setup();
  renderShell(paths.programs);
  await user.type(screen.getByRole('textbox', { name: 'Черновик' }), 'Фильтр программ');
  await user.click(screen.getByRole('button', { name: 'Создать программу' }));
  await user.type(screen.getByRole('textbox', { name: 'Черновик' }), 'Моя программа');
  await user.click(screen.getByRole('link', { name: 'Замеры' }));
  await user.type(screen.getByRole('textbox', { name: 'Черновик' }), '81');
  await user.click(screen.getByRole('link', { name: 'Тренировка' }));
  expect(screen.getByRole('heading', { name: 'Новая программа' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Черновик' })).toHaveValue('Моя программа');
  await user.click(screen.getByRole('button', { name: 'Назад' }));
  expect(screen.getByRole('textbox', { name: 'Черновик' })).toHaveValue('Фильтр программ');
  await user.click(screen.getByRole('link', { name: 'Замеры' }));
  expect(screen.getByRole('textbox', { name: 'Черновик' })).toHaveValue('81');
});

it('keeps the visible tab while a hidden screen finishes saving', async () => {
  let complete!: () => void;
  const later = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const user = userEvent.setup();
  renderShell(paths.programNew, later);
  await user.click(screen.getByRole('button', { name: 'Сохранить позже' }));
  await user.click(screen.getByRole('link', { name: 'Замеры' }));
  await act(async () => {
    complete();
    await later;
  });
  expect(screen.getByLabelText('Адрес')).toHaveTextContent(paths.measurements);
  expect(screen.getByRole('heading', { name: 'Замеры' })).toBeVisible();
  await user.click(screen.getByRole('link', { name: 'Тренировка' }));
  expect(screen.getByLabelText('Адрес')).toHaveTextContent(paths.programs);
  expect(screen.getByRole('heading', { name: 'Программы' })).toBeVisible();
});

it('ignores a previous account screen completing after its shell was destroyed', async () => {
  let complete!: () => void;
  const later = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const user = userEvent.setup();
  function Accounts() {
    const [owner, setOwner] = useState('first');
    return (
      <MemoryRouter initialEntries={[paths.programNew]}>
        <button onClick={() => setOwner('second')}>Сменить аккаунт</button>
        <TabShell
          key={owner}
          renderScreen={(location) => (
            <Routes location={location}>
              <Route path={paths.programNew} element={<Screen title="Редактор" later={later} />} />
              <Route path={paths.programs} element={<Screen title="Программы" later={later} />} />
            </Routes>
          )}
        />
        <BrowserAddress />
      </MemoryRouter>
    );
  }
  render(<Accounts />);
  await user.type(screen.getByRole('textbox', { name: 'Черновик' }), 'Данные первого аккаунта');
  await user.click(screen.getByRole('button', { name: 'Сохранить позже' }));
  await user.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));
  expect(screen.getByRole('textbox', { name: 'Черновик' })).toHaveValue('');
  await act(async () => {
    complete();
    await later;
  });
  expect(screen.getByLabelText('Адрес')).toHaveTextContent(paths.programNew);
  expect(screen.getByRole('textbox', { name: 'Черновик' })).toHaveValue('');
});

it('does not replace a newer screen when its hidden parent finishes saving', async () => {
  let complete!: () => void;
  const later = new Promise<void>((resolve) => {
    complete = resolve;
  });
  const user = userEvent.setup();
  renderShell(paths.programs, later);
  await user.click(screen.getByRole('button', { name: 'Сохранить позже' }));
  await user.click(screen.getByRole('button', { name: 'Создать программу' }));
  await user.type(screen.getByRole('textbox', { name: 'Черновик' }), 'Новый черновик');
  await act(async () => {
    complete();
    await later;
  });
  expect(screen.getByLabelText('Адрес')).toHaveTextContent(paths.programNew);
  expect(screen.getByRole('heading', { name: 'Новая программа' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Черновик' })).toHaveValue('Новый черновик');
});
