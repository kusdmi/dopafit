/**
 * Единый источник правды для всех маршрутов приложения.
 *
 * Гостевые экраны (/welcome, /login, /register, /password-reset) и корень "/"
 * живут БЕЗ префикса. Вся авторизованная зона табов — ПОД префиксом /app
 * (/app/home, /app/programs, /app/settings и т.д.). Префикс — структурный фикс
 * двух багов WebKit: зона-Route больше не сидит на path="/" и не матчит любой
 * путь, поэтому findViewItemByPath не плодит дубли view-item и не путает зону с
 * гостевым экраном. Подробности — в src/app/router.tsx.
 *
 * Здесь и ТОЛЬКО здесь допустимы строковые литералы путей. Все компоненты и
 * тесты обязаны импортировать пути отсюда, а не хардкодить их.
 */

/** Корень приложения. Редиректит на /app/home (авторизован) или /welcome (гость). */
const root = '/';

/** Префикс всей авторизованной зоны табов. */
const app = '/app';

export const paths = {
  // --- корень и гостевые экраны (без префикса) ---
  /** Корень "/". */
  root,
  /** Онбординг первого запуска: показывается до приветствия и только один раз. */
  onboarding: '/onboarding',
  /** Экран приветствия. */
  welcome: '/welcome',
  /** Экран входа. */
  login: '/login',
  /** Экран регистрации/онбординга. */
  register: '/register',
  /** Приглашение по реферальной ссылке: `/invite/:code`.
   *  Формат задаёт backend (modules/commerce/http/endpoints.ts: `{inviteUrl}/invite/{code}`),
   *  менять его здесь в одиночку нельзя. Экрана у маршрута нет — он
   *  перекладывает код в регистрацию (см. router.tsx). */
  invite: '/invite/:code',
  /** Экран восстановления пароля. */
  passwordReset: '/password-reset',

  // --- префикс зоны ---
  /** Префикс зоны табов: render-путь внешнего аутлета (Route path="/app"). */
  app,

  // --- вкладка "home" ---
  /** Главная. */
  home: `${app}/home`,
  /** Календарь тренировок (внутри вкладки home). */
  homeCalendar: `${app}/home/calendar`,
  /** Уведомления (внутри вкладки home). */
  homeNotifications: `${app}/home/notifications`,

  // --- вкладка "measurements" ---
  /** Замеры. */
  measurements: `${app}/measurements`,

  // --- вкладка "programs" ---
  /** Каталог программ. */
  programs: `${app}/programs`,
  /** Создание новой программы. */
  programNew: `${app}/programs/new`,
  /** Каталог упражнений. */
  exercises: `${app}/programs/exercises`,

  // --- вкладка "analytics" ---
  /** Аналитика. */
  analytics: `${app}/analytics`,

  // --- вкладка "settings" ---
  /** Настройки. */
  settings: `${app}/settings`,
  /** Личные данные. */
  settingsProfile: `${app}/settings/profile`,
  /** Installation guide for mobile browsers. */
  settingsInstall: `${app}/settings/install`,
  /** Контакты (email и телефон, статусы подтверждения). */
  settingsContacts: `${app}/settings/contacts`,
  /** Подписка. */
  settingsSubscription: `${app}/settings/subscription`,
  /** Legacy subscription checkout; redirects to Premium settings. */
  subscriptionCheckout: '/subscription',
  /** Настройки уведомлений. */
  settingsNotifications: `${app}/settings/notifications`,
  /** Реферальная программа. */
  settingsReferral: `${app}/settings/referral`,
  /** Оформление (тема). */
  settingsTheme: `${app}/settings/theme`,
  /** Безопасность. */
  settingsSecurity: `${app}/settings/security`,
  /** Удаление аккаунта (необратимое). */
  settingsDelete: `${app}/settings/delete-account`,
  /** Клиенты/тренер (связи). */
  connections: `${app}/settings/connections`,
  /** Добавление клиента. */
  connectionAdd: `${app}/settings/connections/add`,

  // --- техподдержка (вкладка settings) ---
  /** Техподдержка (новое обращение). */
  support: `${app}/support`,
  /** Список обращений. */
  supportList: `${app}/support/list`,
} as const;

// --- билдеры путей с параметрами ---

/** Детальная страница программы. */
export const program = (id: string) => `${app}/programs/${id}`;
/** Редактирование программы. */
export const programEdit = (id: string) => `${app}/programs/${id}/edit`;
/** Поделиться программой. */
export const programShare = (id: string) => `${app}/programs/${id}/share`;
/** Старт тренировки по программе. */
export const programStart = (id: string) => `${app}/programs/${id}/start`;
/** Активная сессия тренировки по программе. */
export const programSession = (id: string) => `${app}/programs/${id}/session`;
/** Детальная страница упражнения. */
export const exercise = (id: string) => `${app}/programs/exercises/${id}`;
/** Итоги завершённой тренировки. */
export const workoutSummary = (sessionId: string) =>
  `${app}/programs/workouts/${sessionId}/summary`;
/** Тред обращения в техподдержку. */
export const supportThread = (id: string) => `${app}/support/${id}`;
/** Редактирование клиента. */
export const connectionEdit = (id: string) => `${app}/settings/connections/${id}/edit`;
/** Замеры клиента (только чтение, для тренера). */
export const connectionMeasurements = (id: string) =>
  `${app}/settings/connections/${id}/measurements`;
