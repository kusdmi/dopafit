import { useState } from 'react';
import { recordInstallReminder, usePwaInstall } from '@/shared/lib/platform/pwa/install';
import { Button } from '@/shared/ui/Button';
import { SettingsShell } from '../ui/SettingsShell';

const instructions = {
  ios: [
    {
      title: 'Откройте DopaFit в Safari',
      description:
        'Если вы открыли ссылку в мессенджере или другом браузере, перейдите в Safari и откройте эту же страницу.',
    },
    {
      title: 'Откройте меню «Поделиться»',
      description:
        'Нажмите значок «Поделиться» в Safari. В некоторых версиях он находится в меню страницы.',
    },
    {
      title: 'Добавьте на экран «Домой»',
      description:
        'Выберите «На экран Домой», оставьте «Открыть как веб-приложение» включённым, если такой переключатель есть, и нажмите «Добавить». Если пункта нет, найдите его через «Редактировать действия».',
    },
    {
      title: 'Запускайте с нового значка',
      description:
        'Закройте Safari и откройте DopaFit с экрана «Домой». При первом запуске может потребоваться снова войти в аккаунт.',
    },
  ],
  android: [
    {
      title: 'Откройте DopaFit в Chrome',
      description:
        'Если страница открыта внутри мессенджера, выберите открытие во внешнем браузере Chrome.',
    },
    {
      title: 'Найдите установку в меню',
      description:
        'Нажмите ⋮ рядом с адресной строкой. Выберите «Установить и создать ярлык» или «Установить приложение». В некоторых версиях пункт называется «Добавить на главный экран».',
    },
    {
      title: 'Подтвердите установку',
      description:
        'Выберите «Установить» и подтвердите действие в окне браузера. Названия пунктов могут отличаться в других браузерах.',
    },
    {
      title: 'Откройте DopaFit',
      description:
        'Найдите значок DopaFit на главном экране или в списке приложений и откройте его. Установка не удаляет ваши данные.',
    },
  ],
} as const;

export function InstallAppPage() {
  const install = usePwaInstall();
  const [platform, setPlatform] = useState<'ios' | 'android'>(install.platform ?? 'ios');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const current = instructions[platform][step];
  const startInstall = async () => {
    setBusy(true);
    const outcome = await install.promptInstall();
    setBusy(false);
    recordInstallReminder();
    setMessage(
      outcome === 'accepted'
        ? 'Установка подтверждена. Дождитесь появления значка DopaFit.'
        : outcome === 'dismissed'
          ? 'Установка отменена. Вы можете вернуться к инструкции позже.'
          : 'Откройте меню браузера и следуйте инструкции ниже.',
    );
  };
  return (
    <SettingsShell title="Установка приложения">
      {install.native || install.standalone ? (
        <p role="status" className="text-body-m text-success">
          Вы уже используете установленное приложение DopaFit.
        </p>
      ) : (
        <p className="text-body-m text-muted">
          Добавьте DopaFit на экран «Домой», чтобы открывать его в отдельном окне без вкладок
          браузера.
        </p>
      )}
      <div role="group" aria-label="Устройство" className="flex gap-3">
        {(['ios', 'android'] as const).map((value) => (
          <Button
            key={value}
            variant={platform === value ? 'primary' : 'outline'}
            aria-pressed={platform === value}
            onClick={() => {
              setPlatform(value);
              setStep(0);
              setMessage('');
            }}
          >
            {value === 'ios' ? 'iPhone / iPad' : 'Android'}
          </Button>
        ))}
      </div>
      {!install.native && !install.standalone && platform === 'android' && install.canPrompt && (
        <Button
          onClick={() => {
            void startInstall();
          }}
          loading={busy}
          disabled={busy}
        >
          Установить сейчас
        </Button>
      )}
      <section
        aria-label="Пошаговая инструкция"
        className="flex flex-col gap-4 rounded-[20px] border border-line p-5"
      >
        <p className="text-body-s text-muted" aria-live="polite">
          Шаг {step + 1} из {instructions[platform].length}
        </p>
        <div className="flex gap-2" role="group" aria-label="Шаги установки">
          {instructions[platform].map((item, index) => (
            <button
              key={item.title}
              type="button"
              aria-label={`Шаг ${index + 1}: ${item.title}`}
              aria-current={index === step ? 'step' : undefined}
              onClick={() => setStep(index)}
              className={`flex size-[44px] items-center justify-center rounded-full border ${index === step ? 'border-brand-400 bg-brand-400 text-white' : 'border-line text-muted'}`}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <h2 className="text-h2 text-content">{current.title}</h2>
        <p className="text-body-m text-content">{current.description}</p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={step === 0}
            onClick={() => setStep((value) => value - 1)}
          >
            Назад
          </Button>
          {step < instructions[platform].length - 1 ? (
            <Button onClick={() => setStep((value) => value + 1)}>Далее</Button>
          ) : (
            <Button
              onClick={() => {
                recordInstallReminder();
                setMessage(
                  'Инструкция пройдена. Откройте DopaFit с экрана «Домой», когда добавите значок.',
                );
              }}
            >
              Понятно
            </Button>
          )}
        </div>
      </section>
      {message && (
        <p role="status" className="text-body-s text-muted">
          {message}
        </p>
      )}
    </SettingsShell>
  );
}
