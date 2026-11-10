import { PASSWORD_REQUIREMENTS } from '@/shared/lib/validation/password';
const ERROR_REASON_MESSAGES: Record<string, string> = {
  email_taken: 'Этот email уже зарегистрирован',
  phone_taken: 'Этот телефон уже зарегистрирован',
  custom_exercise_limit: 'Достигнут лимит пользовательских упражнений',
  link_request_pending: 'Запрос уже отправлен и ждёт ответа',
  already_linked: 'Вы уже связаны с этим человеком',
  account_not_found: 'Аккаунт с такими данными не найден',
  link_role_mismatch: 'Связь возможна только между тренером и клиентом',
  invalid_credentials: 'Неверный email или пароль',
  invalid_password: 'Неверный пароль',
  invalid_refresh_token: 'Сессия истекла. Войдите ещё раз',
  verification_code_expired: 'Неверный или просроченный код',
  invalid_verification_code: 'Неверный код подтверждения',
  verification_attempts_exceeded: 'Слишком много попыток. Запросите новый код',
  code_send_cooldown: 'Код уже запрошен. Дождитесь повторной отправки',
  code_send_limit: 'Слишком много запросов кода. Попробуйте позже',
  email_confirmation_required: 'Сначала подтвердите email',
  password_required: 'Сначала создайте пароль',
  email_required: 'Добавьте email для отправки кода',
  code_required: 'Введите код подтверждения',
  invalid_registration_token: 'Срок регистрации истёк. Начните регистрацию ещё раз',
  invalid_verification_token: 'Подтверждение недействительно или просрочено. Запросите новый код',
  registration_completed: 'Регистрация уже завершена. Войдите в аккаунт',
  invalid_new_password: PASSWORD_REQUIREMENTS,
  captcha_failed: 'Подтвердите, что вы не робот, и попробуйте ещё раз',
  email_delivery_failed: 'Не удалось отправить письмо. Попробуйте позже',
  contact_already_verified: 'Контакт уже подтверждён',
  personal_data_consent_required: 'Необходимо согласие на обработку персональных данных',
  program_limit: 'Достигнут лимит программ. Подтвердите бесплатный выбор или подключите Premium',
  client_limit: 'Достигнут лимит клиентов. Подтвердите бесплатный выбор или подключите Premium',
  program_size: 'Программа превышает лимиты вашего доступа. Premium расширяет лимиты',
  free_selection_required: 'Подтвердите бесплатный выбор программ и клиентов в разделе Premium',
  program_read_only:
    'Программа доступна только для просмотра. Проверьте бесплатный выбор в разделе Premium',
  client_read_only:
    'Клиент доступен только для просмотра. Проверьте бесплатный выбор в разделе Premium',
};

const defaults: Record<string, string> = {
  bad_request: 'Не удалось выполнить запрос. Проверьте введённые данные',
  unauthorized: 'Не удалось подтвердить вход. Войдите ещё раз',
  forbidden: 'Это действие недоступно',
  not_found: 'Данные не найдены или больше недоступны',
  conflict: 'Данные изменились или уже существуют. Обновите страницу и повторите действие',
  payload_too_large: 'Размер файла превышает допустимый',
  measurement_date_conflict: 'Замер на эту дату уже существует',
  validation_error: 'Проверьте введённые данные',
  rate_limited: 'Слишком много запросов. Попробуйте позже',
  network_error: 'Не удалось связаться с сервером',
  captcha_unavailable: 'Не удалось загрузить проверку. Попробуйте ещё раз',
  captcha_cancelled: 'Проверка отменена. Повторите попытку',
};

export function apiErrorReason(details: unknown): string | null {
  if (typeof details !== 'object' || details === null || !('reason' in details)) return null;
  return typeof details.reason === 'string' ? details.reason : null;
}

export function localizedReasonMessage(details: unknown): string | undefined {
  const reason = apiErrorReason(details);
  return reason && Object.hasOwn(ERROR_REASON_MESSAGES, reason)
    ? ERROR_REASON_MESSAGES[reason]
    : undefined;
}

/** The server message is diagnostic only; UI text depends on stable identifiers. */
export function localizedErrorMessage(code: string, details: unknown): string {
  return (
    localizedReasonMessage(details) ??
    (Object.hasOwn(defaults, code)
      ? defaults[code]
      : 'Не удалось выполнить действие. Попробуйте ещё раз')
  );
}
