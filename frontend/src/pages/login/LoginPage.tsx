import {
  HistoryBack,
  ToolbarActions,
  PageContent,
  PageHeader,
  Page,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';
import { Navigate, useLocation } from 'react-router-dom';

import { useSessionStore } from '@/entities/session/model/store';
import { LoginForm } from '@/features/auth/login/LoginForm';
import { paths } from '@/shared/config/paths';
import { normalizePathname } from '@/shared/lib/normalizePathname';

/** Screen 7: sign in with phone/email and password. */
export function LoginPage() {
  // Декларативный гард: после успешного логина isAuthenticated становится true,
  // и этот Navigate (а НЕ history.replace из формы) уводит на главную.
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  // Гейтим редирект на активность вью (location === /login): скрытый в стеке
  // Login-экран не должен перехватывать setSession из register-визарда и
  // уводить на /app/home, размонтируя онбординг.
  const location = useLocation();
  if (isAuthenticated && normalizePathname(location.pathname) === normalizePathname(paths.login)) {
    return <Navigate replace to={paths.home} />;
  }

  return (
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <ToolbarActions slot="start">
            <HistoryBack defaultHref={paths.welcome} text="" />
          </ToolbarActions>
          <PageTitle>Вход</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding px-[26px]">
        {/* Figma 392:2021: gap 30px между заголовком (уже задан toolbar'ом
            через PageTitle — второй видимый "Вход" не дублируем, primitives
            не трогаем) и полями формы. */}
        <div className="mx-auto flex max-w-md flex-col gap-[30px] pt-6">
          <LoginForm />
        </div>
      </PageContent>
    </Page>
  );
}
