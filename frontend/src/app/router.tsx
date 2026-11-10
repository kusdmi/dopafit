import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  type Location,
} from 'react-router-dom';

import { CalendarPage } from '@/pages/calendar/CalendarPage';
import { AddClientPage } from '@/pages/clients/AddClientPage';
import { ClientEditPage } from '@/pages/clients/ClientEditPage';
import { ClientMeasurementsPage } from '@/pages/clients/ClientMeasurementsPage';
import { ClientsPage } from '@/pages/clients/ClientsPage';
import { HomePage } from '@/pages/home/HomePage';
import { LoginPage } from '@/pages/login/LoginPage';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { PasswordResetPage } from '@/pages/password-reset/PasswordResetPage';
import { RegisterPage } from '@/pages/register/RegisterPage';
import {
  DeleteAccountPage,
  NotificationSettingsPage,
  ProfileSettingsPage,
  ReferralPage,
  SettingsPage,
  SubscriptionPage,
  ThemeSettingsPage,
} from '@/pages/settings';
import { SubscriptionCheckoutPage } from '@/pages/settings/subscription/SubscriptionCheckoutPage';
import { ExerciseDetailPage } from '@/pages/exercises/ExerciseDetailPage';
import { ExercisesPage } from '@/pages/exercises/ExercisesPage';
import { ProgramBuilderPage } from '@/pages/programs/ProgramBuilderPage';
import { ProgramDetailPage } from '@/pages/programs/ProgramDetailPage';
import { ProgramsPage } from '@/pages/programs/ProgramsPage';
import { ShareProgramPage } from '@/pages/programs/ShareProgramPage';
import { StartWorkoutPage } from '@/pages/programs/StartWorkoutPage';
import { WorkoutPage } from '@/pages/programs/WorkoutPage';
import { WorkoutSummaryPage } from '@/pages/programs/WorkoutSummaryPage';
import { MeasurementsPage } from '@/pages/measurements/MeasurementsPage';
import { AnalyticsPage } from '@/pages/analytics/AnalyticsPage';
import { SupportListPage, SupportPage, SupportThreadPage } from '@/pages/support';
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage';
import { WelcomePage } from '@/pages/welcome/WelcomePage';

import { useOnboardingStore } from '@/entities/onboarding/model/store';
import { useSessionStore } from '@/entities/session/model/store';

import { ActiveWorkoutWidget } from '@/features/active-sessions/ActiveWorkoutWidget';

import { paths } from '@/shared/config/paths';

import { InstallAppPage } from '@/pages/settings/install/InstallAppPage';
import { PwaInstallHint } from '@/features/pwa-install/PwaInstallHint';
import { BuilderStoreProvider } from '@/features/program-editor/builder/BuilderStoreProvider';
import { TabShell } from '@/app/navigation/TabShell';
import { MetrikaTracking } from '@/app/MetrikaTracking';
import { EmailVerifyBanner } from '@/features/email-verify-banner/EmailVerifyBanner';
import { useMarkNotificationRead } from '@/entities/notification/model/use-open-notification';
import { useNotificationNavigation } from '@/shared/lib/platform/push/notification-navigation';

/**
 * Render-less: переводит приложение на экран из системного уведомления и гасит его.
 *
 * Живёт ЗДЕСЬ, а не рядом с PushRegistration в App.tsx: хук зовёт useNavigate,
 * а тот работает только внутри BrowserRouter.
 *
 * Пометку прочитанным сшиваем здесь, а не внутри хука: сам хук лежит в `shared`
 * и на `entities/notification` ссылаться не может. Ошибка пометки (в том числе
 * «ещё не авторизованы» при холодном старте с пуша) переход не ломает — `mutate`
 * не бросает, а запрос уходит в офлайн-очередь и доезжает позже.
 */
function NotificationNavigation() {
  const markRead = useMarkNotificationRead();
  useNotificationNavigation(markRead);
  return null;
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <MetrikaTracking />
      <ApplicationScreen />
      <PwaInstallHint />
      <NotificationNavigation />
      <ActiveWorkoutWidget />
      <EmailVerifyBanner />
    </BrowserRouter>
  );
}
/**
 * Куда попадает холодный старт: главная (авторизован) → онбординг (первый
 * запуск) → приветствие.
 *
 * Онбординг стоит ПЕРЕД гостевыми экранами: его смотрят до входа и до
 * регистрации, когда аккаунта ещё нет. Проверка авторизации всё равно первая —
 * вернувшийся пользователь, у которого флаг почему-то пуст (переустановка при
 * живом Keychain, ручная чистка стораджа), не должен упираться в экран
 * первого запуска вместо своей главной.
 *
 * Читать `seen` здесь безопасно: App.tsx монтирует роутер только после
 * гидрации всех persist-сторов (useStoresHydrated), поэтому значение здесь —
 * уже с диска, а не стартовое `false`.
 */
function RootRedirect() {
  const authenticated = useSessionStore((s) => s.isAuthenticated);
  const seenOnboarding = useOnboardingStore((s) => s.seen);
  if (authenticated) return <Navigate replace to={paths.home} />;
  return <Navigate replace to={seenOnboarding ? paths.welcome : paths.onboarding} />;
}
/**
 * Реферальная ссылка `/invite/:code` (формат задаёт backend —
 * modules/commerce/http/endpoints.ts). Своего экрана у неё нет: она открывает
 * регистрацию с уже подставленным кодом приглашения.
 *
 * Раньше маршрута не было вовсе, ссылка проваливалась в catch-all `path="*"`
 * и уезжала на /welcome — код приглашения терялся молча, и пригласивший не
 * получал реферала, даже если человек тут же регистрировался.
 *
 * Код передаётся через state истории, а не через query: в адресной строке он
 * не нужен, а `replace` не оставляет промежуточной записи, поэтому «назад» с
 * регистрации ведёт туда, откуда пришли, а не обратно по ссылке в петлю.
 *
 * Уже авторизованного приглашение не касается — его встречает обычный
 * RootRedirect, как и любой гостевой экран.
 */
function InviteRedirect() {
  const authenticated = useSessionStore((s) => s.isAuthenticated);
  const { code } = useParams<{ code: string }>();
  if (authenticated) return <Navigate replace to={paths.home} />;
  return <Navigate replace to={paths.register} state={{ inviteCode: code ?? '' }} />;
}
function ApplicationScreen() {
  const location = useLocation();
  const user = useSessionStore((state) => state.user);
  const authenticated = useSessionStore((state) => state.isAuthenticated);
  const protectedPath =
    location.pathname === paths.app ||
    location.pathname.startsWith(`${paths.app}/`) ||
    location.pathname === paths.subscriptionCheckout;
  if (protectedPath) {
    if (!authenticated) return <Navigate replace to={paths.welcome} />;
    return <TabShell key={user?.id} renderScreen={renderProtectedScreen} />;
  }
  return (
    <Routes>
      <Route path={paths.root} element={<RootRedirect />} />
      <Route path={paths.onboarding} element={<OnboardingPage />} />
      <Route path={paths.welcome} element={<WelcomePage />} />
      <Route path={paths.login} element={<LoginPage />} />
      <Route path={paths.register} element={<RegisterPage />} />
      <Route path={paths.invite} element={<InviteRedirect />} />
      <Route path={paths.passwordReset} element={<PasswordResetPage />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

function renderProtectedScreen(location: Location) {
  return (
    <Routes location={location}>
      <Route path={paths.subscriptionCheckout} element={<SubscriptionCheckoutPage />} />
      <Route path={paths.home} element={<HomePage />} />
      <Route path={paths.homeCalendar} element={<CalendarPage />} />
      <Route path={paths.homeNotifications} element={<NotificationsPage />} />
      <Route path={paths.measurements} element={<MeasurementsPage />} />
      <Route path={paths.programs} element={<ProgramsPage />} />
      <Route path="/app/programs/:id" element={<ProgramDetailPage />} />
      <Route
        path="/app/programs/:id/edit"
        element={
          <BuilderStoreProvider>
            <ProgramBuilderPage />
          </BuilderStoreProvider>
        }
      />
      <Route path="/app/programs/:id/share" element={<ShareProgramPage />} />
      <Route path="/app/programs/:id/start" element={<StartWorkoutPage />} />
      <Route path="/app/programs/:id/session" element={<WorkoutPage />} />
      <Route
        path={paths.programNew}
        element={
          <BuilderStoreProvider>
            <ProgramBuilderPage />
          </BuilderStoreProvider>
        }
      />
      <Route path={paths.exercises} element={<ExercisesPage />} />
      <Route path="/app/programs/exercises/:id" element={<ExerciseDetailPage />} />
      <Route path="/app/programs/workouts/:sessionId/summary" element={<WorkoutSummaryPage />} />
      <Route path={paths.analytics} element={<AnalyticsPage />} />
      <Route path={paths.settings} element={<SettingsPage />} />
      <Route path={paths.settingsInstall} element={<InstallAppPage />} />
      <Route path={paths.settingsProfile} element={<ProfileSettingsPage />} />
      <Route
        path={paths.settingsContacts}
        element={<Navigate to={`${paths.settingsProfile}#contacts`} replace />}
      />
      <Route path={paths.settingsSubscription} element={<SubscriptionPage />} />
      <Route path={paths.settingsNotifications} element={<NotificationSettingsPage />} />
      <Route path={paths.settingsReferral} element={<ReferralPage />} />
      <Route path={paths.settingsTheme} element={<ThemeSettingsPage />} />
      <Route
        path={paths.settingsSecurity}
        element={<Navigate to={`${paths.settingsProfile}#security`} replace />}
      />
      <Route path={paths.settingsDelete} element={<DeleteAccountPage />} />
      <Route path={paths.connections} element={<ClientsPage />} />
      <Route path={paths.connectionAdd} element={<AddClientPage />} />
      <Route path="/app/settings/connections/:id/edit" element={<ClientEditPage />} />
      <Route
        path="/app/settings/connections/:id/measurements"
        element={<ClientMeasurementsPage />}
      />
      <Route path={paths.support} element={<SupportPage />} />
      <Route path="/app/support/:id" element={<SupportThreadPage />} />
      <Route path={paths.supportList} element={<SupportListPage />} />
      <Route path="/app/*" element={<Navigate replace to={paths.home} />} />
      <Route path="*" element={<Navigate replace to={paths.home} />} />
    </Routes>
  );
}
