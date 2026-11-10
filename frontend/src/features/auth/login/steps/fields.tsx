import type { ComponentProps } from 'react';

import { Input } from '@/shared/ui/Input';

/** Shared password field for the password and two-factor screens (identical
 *  markup + autocomplete pairing). Forwards the react-hook-form register props. */
export function PasswordField(props: Omit<ComponentProps<typeof Input>, 'label' | 'type'>) {
  return (
    <Input
      label="Пароль"
      type="password"
      placeholder="Введите пароль"
      autoComplete="current-password"
      // Пароль — последнее поле формы входа, и Enter её реально отправляет
      // (шаги обёрнуты в <form onSubmit>), поэтому системная клавиша
      // подписывается «Войти» вместо безличного «Ввод».
      enterKeyHint="go"
      {...props}
    />
  );
}

/**
 * Email field shared by both contact-step variants.
 *
 * `autoComplete` is a prop rather than a fixed token, because the two screens
 * want different ones and neither is right for both:
 *
 * - Passwordless (ContactStep, the primary flow): there is NO password field on
 *   the form, so `username` describes an incomplete sign-in form and iOS/Safari
 *   offer nothing. `email` is the token that makes the system suggest saved
 *   addresses from Contacts and the keychain, and it is what already works on
 *   AccountStep and the contacts settings screen. Hence the default.
 * - Password sign-in (PasswordStep): the field is paired with a
 *   `current-password` input, and password managers match a stored credential
 *   by the `username` half of that pair. That screen keeps `username` — an
 *   `email` token there would break login/password autofill.
 */
export function EmailField({
  autoComplete = 'email',
  ...props
}: Omit<ComponentProps<typeof Input>, 'label' | 'type'>) {
  return (
    <Input
      label="Email"
      type="email"
      inputMode="email"
      placeholder="mail@example.com"
      autoComplete={autoComplete}
      // iOS otherwise capitalises the first letter and runs autocorrect over
      // the address as it is typed.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      // Email — единственное поле на шаге, и Enter отправляет форму (переход к
      // следующему шагу), поэтому «Далее», а не «Ввод». Пробрасывается через
      // props: на шаге входа по паролю ниже есть ещё поле пароля, и там
      // вызывающий может переопределить на 'next'.
      enterKeyHint="go"
      {...props}
    />
  );
}

/** Сообщение об ошибке над кнопками — одинаковое на всех шагах входа. */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-body-s text-danger">
      {message}
    </p>
  );
}
