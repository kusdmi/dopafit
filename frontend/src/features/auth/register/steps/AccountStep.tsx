import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';

import { useRegister } from '@/entities/session/api/use-register';
import { toApiError } from '@/shared/api/client';
import { errorText } from '@/shared/api/error-reasons';
import { offlineLabel } from '@/shared/lib/network/offlineLabel';
import { useNetworkStatus } from '@/shared/lib/network/useNetworkStatus';
import { Button } from '@/shared/ui/Button';
import { peopleOutline, personOutline } from '@/shared/ui/icons';
import { Input } from '@/shared/ui/Input';
import { Icon } from '@/shared/ui/primitives';

import { accountSchema, type AccountValues } from '../lib/schemas';
import { ErrorMessage } from '../ui/ErrorMessage';

interface AccountStepProps {
  /** Previously typed values when stepping back, so the email stays prefilled. */
  initialValues?: AccountValues;
  onRegistered: (payload: {
    account: AccountValues;
    email: string;
    registrationToken: string;
  }) => void;
}

/** Screen 2: account creation. On success it emits the issued registration
 *  token and the confirmed contact so the wizard can advance to the code step. */
export function AccountStep({ initialValues, onRegistered }: AccountStepProps) {
  const { isOnline } = useNetworkStatus();
  const registerMutation = useRegister();

  const form = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: initialValues ?? {
      full_name: '',
      email: '',
      invite_code: '',
      role: 'client',
    },
  });

  const role = useWatch({ control: form.control, name: 'role' });
  // UI messages use stable API reasons with a localized code fallback.
  const accountError = registerMutation.isError
    ? errorText(registerMutation.error, toApiError(registerMutation.error).message)
    : '';

  return (
    // 25px между смысловыми зонами формы (поля → выбор типа → действие) —
    // шаг из design-system.md. Внутри каждой зоны шаг свой и более тесный.
    <form
      className="flex flex-col gap-[25px]"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        registerMutation.mutate(
          {
            full_name: values.full_name,
            email: values.email,
            role: values.role,
            invite_code: values.invite_code || null,
            // Consent is no longer a user-facing checkbox (product decision) —
            // the form always sends true, and a static caption with a policy
            // link renders below the submit button instead. The backend
            // (registration.ts) still requires this field truthy.
            personal_data_consent: true,
          },
          {
            onSuccess: (response) => {
              onRegistered({
                account: values,
                email: response.contact,
                registrationToken: response.registration_token,
              });
            },
          },
        );
      })}
    >
      {/* The screen title now lives in the transparent PageHeader (RegisterPage,
          the page's single <h1>) — same treatment as LoginPage, so a second
          visible "Регистрация" is not repeated here. */}
      {/* Поля — одна зона, между собой 15px (шаг полей формы из макета). */}
      <div className="flex flex-col gap-[15px]">
        <Input
          label="Имя"
          placeholder="Например, Александр"
          autoComplete="name"
          error={form.formState.errors.full_name?.message}
          {...form.register('full_name')}
        />
        <Input
          label="Email"
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register('email')}
        />
        <Input
          label="Код приглашения"
          placeholder="Есть код от друга? Введите тут"
          error={form.formState.errors.invite_code?.message}
          {...form.register('invite_code')}
        />
      </div>
      {/* `role="radiogroup"` + `aria-labelledby` вместо `fieldset`/`legend`.
          Причина — раскладка: по спецификации HTML рендер-бокс `fieldset`
          состоит из legend и ОТДЕЛЬНОГО анонимного бокса содержимого, и
          именно этот анонимный бокс становится flex-контейнером. Legend из
          него исключён, поэтому ни `items-center`, ни `gap` родителя, ни
          `mx-auto` на самой подписи на неё не действуют: она вставала слева и
          прилипала к кнопкам вплотную (0px вместо заявленных 12px).
          Семантика группы при этом не теряется — скринридер объявляет её по
          `aria-labelledby`, и это уже основной приём проекта
          (ClientPicker, ParticipantStep, LoginMethodSection). */}
      <div role="radiogroup" aria-labelledby="account-role-label" className="flex flex-col gap-3">
        <p id="account-role-label" className="text-body-m text-center text-content">
          Выберите тип аккаунта
        </p>
        {/* Figma 392:5163/392:5169 (design-system.md "Выбор типа аккаунта"):
            pill radius 37.5px, padding 10px, icon-label gap 5px, two options
            flex-1 in a row with 15px gap. Selected = accent-400 fill + neutral-50
            text, no border; unselected = transparent + 2px neutral-600 border.
            Native radios stay for a11y/tests (getByRole('radio', {name})) but
            are visually hidden; the label is styled as the pill. */}
        <div className="flex w-full items-stretch justify-center gap-3">
          {(
            [
              { value: 'client', label: 'Тренируюсь сам', icon: personOutline },
              { value: 'trainer', label: 'Я тренер', icon: peopleOutline },
            ] as const
          ).map((option) => {
            const selected = role === option.value;
            return (
              <label
                key={option.value}
                // The native radio is sr-only (clipped to 1px), so its own
                // focus ring is invisible — draw the ring on the styled label.
                // Радиус 16px вместо 37.5px: дробная «пилюля» из DS-узла
                // рисовалась на кнопке 42px, а здесь карточка вдвое выше — при
                // 37.5px её углы срезались почти в овал и не совпадали ни с
                // полями над ней (14px), ни с кнопкой под ней (14px).
                className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-[16px] p-4 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-400 ${
                  selected
                    ? 'bg-brand-400 text-neutral-50'
                    : 'border-2 border-neutral-600 text-content'
                }`}
              >
                <input
                  type="radio"
                  value={option.value}
                  className="sr-only"
                  {...form.register('role')}
                />
                <Icon icon={option.icon} className="text-[28px]" />
                <span className="text-h3">{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
      <ErrorMessage message={accountError} />
      <div className="flex flex-col gap-2.5">
        <Button
          type="submit"
          disabled={!isOnline || registerMutation.isPending}
          loading={registerMutation.isPending}
        >
          {offlineLabel(isOnline, 'Далее')}
        </Button>
        {/* Product decision: no consent checkbox — a caption with a link to the
            policy sits under the submit button instead. The form still always
            sends personal_data_consent: true (see onSubmit above). */}
        {/* Подпись под кнопкой: Caption с интерлиньяжем — роль задаёт
            line-height 1, из-за чего двухстрочная подпись со ссылкой слипалась,
            а подчёркивание переноса наезжало на первую строку. */}
        <p className="text-caption text-center leading-[1.45] text-muted">
          Продолжая, вы соглашаетесь на{' '}
          {/* Static stub from public/legal until the real text lands (agreed
              in the spec). Exact file name with .html: static files resolve
              by exact path, an extensionless URL falls through to the SPA. */}
          <a
            href="/legal/personal-data.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-text underline"
          >
            обработку персональных данных
          </a>
        </p>
      </div>
    </form>
  );
}
