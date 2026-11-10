import type { components } from '@/shared/api/schema';

import { ErrorText, StatusText } from '../../ui/SettingsShell';

type LoginMethod = components['schemas']['LoginMethod'];
type UserOut = components['schemas']['UserOut'];

const METHOD_OPTIONS: { value: LoginMethod; label: string; hint: string }[] = [
  { value: 'code', label: 'Код на email', hint: 'Одноразовый код при каждом входе' },
  { value: 'password', label: 'Пароль', hint: 'Классический вход по паролю' },
  { value: 'two_factor', label: 'Код + пароль', hint: 'Сначала код на email, затем пароль' },
];

/** Why the method is unavailable, or null when it can be selected. */
function methodRestriction(method: LoginMethod, user: UserOut): string | null {
  if ((method === 'code' || method === 'two_factor') && !user.email_verified) {
    return 'Сначала подтвердите email';
  }
  if ((method === 'password' || method === 'two_factor') && !user.has_password) {
    return 'Сначала задайте пароль';
  }
  return null;
}

interface Props {
  user: UserOut;
  isOnline: boolean;
  pending: boolean;
  error: unknown;
  savedMessage: string;
  onSelect: (method: LoginMethod) => void;
}

export function LoginMethodSection({
  user,
  isOnline,
  pending,
  error,
  savedMessage,
  onSelect,
}: Props) {
  return (
    <section className="flex flex-col gap-[15px]">
      <h2 id="login-method-heading" className="text-caption px-[10px] text-muted">
        Способ входа
      </h2>
      <div
        role="radiogroup"
        aria-labelledby="login-method-heading"
        className="flex flex-col gap-[15px]"
      >
        {METHOD_OPTIONS.map((option) => {
          const restriction = methodRestriction(option.value, user);
          const isActive = user.login_method === option.value;
          return (
            <label
              key={option.value}
              className={`flex items-start gap-[10px] rounded-[14px] border p-[10px] ${
                isActive ? 'border-success' : 'border-line'
              } ${restriction ? 'opacity-60' : ''}`}
            >
              <input
                type="radio"
                name="login_method"
                className="mt-1"
                value={option.value}
                checked={isActive}
                disabled={!isOnline || restriction !== null || pending}
                onChange={() => {
                  if (!isActive) {
                    onSelect(option.value);
                  }
                }}
              />
              <span className="flex flex-col gap-[5px]">
                <span className="text-h3 text-content">{option.label}</span>
                <span className="text-caption text-muted">{option.hint}</span>
                {restriction ? (
                  <span className="text-caption text-danger">{restriction}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      <ErrorText error={error} />
      <StatusText message={savedMessage} />
      <p className="text-body-s px-[10px] text-muted">
        Смена способа входа подтверждается кодом на email.
      </p>
    </section>
  );
}
