import { PageContent, Page, useToast } from '@/shared/ui/primitives';
import { useEffect } from 'react';
import {  Navigate, useLocation  } from 'react-router-dom';
import { useNavigation } from '@/shared/lib/navigation';

import { useSessionStore } from '@/entities/session/model/store';
import { paths } from '@/shared/config/paths';
import { ACCOUNT_DELETED_TOAST_FLAG } from '@/shared/config/session-flags';
import { normalizePathname } from '@/shared/lib/normalizePathname';
import { Button } from '@/shared/ui/Button';
import { Logo } from '@/shared/ui/Logo';

/** Screen 1: entry point — logo plus sign-in / sign-up choice. */
export function WelcomePage() {
  const history = useNavigation();
  const [presentToast] = useToast();
  // После удаления аккаунта teardown жёстко приводит сюда и оставляет флаг в
  // sessionStorage (переживает hard-navigation). Показываем toast один раз и
  // сразу гасим флаг, чтобы обычный заход на /welcome его не переигрывал.
  useEffect(() => {
    let flag: string | null = null;
    try {
      flag = sessionStorage.getItem(ACCOUNT_DELETED_TOAST_FLAG);
      if (flag) {
        sessionStorage.removeItem(ACCOUNT_DELETED_TOAST_FLAG);
      }
    } catch {
      // Приватный режим / недоступный storage — просто не покажем toast.
    }
    if (flag) {
      void presentToast({ message: 'Аккаунт удалён', duration: 2500 });
    }
  }, [presentToast]);
  // Авторизованный не должен видеть welcome — декларативный редирект на главную.
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated);
  // Редирект гейтим на то, что welcome — действительно активный путь.
  // Исторически это защищало от скрытых смонтированных экранов; сохраняем гейт,
  // потому что он же делает редирект независимым от того, где смонтирован экран.
  const location = useLocation();
  if (isAuthenticated && normalizePathname(location.pathname) === normalizePathname(paths.welcome)) {
    return <Navigate replace to={paths.home} />;
  }

  return (
    <Page background="gradient">
      <PageContent scrollY={false} className="page-padding">
        {/* Единственный экран без `PageHeader`, поэтому безопасную зону сверху
            он обязан добавлять сам — у остальных её держит `.page-header`.
            В установленном на iOS PWA статус-бар прозрачный
            (`apple-mobile-web-app-status-bar-style=black-translucent`, см.
            index.html), и страница рисуется ПОД часами: без слагаемого
            `env(safe-area-inset-top)` логотип уезжал бы им за спину. Снизу
            такая же пара уже стояла. */}
        <main className="mx-auto flex h-full max-w-md flex-col justify-between pt-[calc(3rem+env(safe-area-inset-top))] pb-[calc(3rem+env(safe-area-inset-bottom))]">
          {/* Figma 392:1962: logo sits above the vertical center (no tagline
              copy below it in this node), CTAs pinned to the bottom. */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <Logo className="h-14 w-auto max-w-[80%] text-content" />
          </div>
          <div className="flex flex-col gap-[15px]">
            <Button onClick={() => history.push(paths.login)}>Войти</Button>
            <Button variant="outline" onClick={() => history.push(paths.register)}>
              Регистрация
            </Button>
          </div>
        </main>
      </PageContent>
    </Page>
  );
}
