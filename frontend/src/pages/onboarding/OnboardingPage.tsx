import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { PageContent, Page } from '@/shared/ui/primitives';
import { useNavigation } from '@/shared/lib/navigation';

import { ONBOARDING_SLIDES } from '@/entities/onboarding/model/slides';
import { useOnboardingStore } from '@/entities/onboarding/model/store';
import { paths } from '@/shared/config/paths';
import { normalizePathname } from '@/shared/lib/normalizePathname';
import { Button } from '@/shared/ui/Button';

/**
 * Экран первого запуска (Figma 392:1951): мотивационная цитата над кнопкой
 * «Далее». Открывается ДО входа и регистрации и ровно один раз — дальше его
 * закрывает флаг `useOnboardingStore`.
 *
 * Слайдов в макете пока один, но экран сразу собран слайдером: «Далее» ведёт
 * к следующему слайду и только на последнем закрывает онбординг. Добавить
 * второй слайд — значит дописать элемент в ONBOARDING_SLIDES, разметку это не
 * трогает.
 */
export function OnboardingPage() {
  const history = useNavigation();
  const markSeen = useOnboardingStore((s) => s.markSeen);
  const seen = useOnboardingStore((s) => s.seen);
  const [index, setIndex] = useState(0);
  const location = useLocation();

  const slide = ONBOARDING_SLIDES[index] ?? ONBOARDING_SLIDES[0];
  const isLast = index >= ONBOARDING_SLIDES.length - 1;

  // Онбординг, который уже посмотрели, открывать по прямой ссылке незачем.
  // Редирект гейтим на то, что это активный путь — тем же приёмом, что и
  // гостевые экраны (WelcomePage, B003): экран может остаться смонтированным
  // в аутлете, и тогда его <Navigate> увёл бы пользователя с чужого экрана.
  if (seen && normalizePathname(location.pathname) === normalizePathname(paths.onboarding)) {
    return <Navigate replace to={paths.welcome} />;
  }

  const next = () => {
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    markSeen();
    history.push(paths.welcome);
  };

  if (!slide) return null;

  return (
    <Page background="gradient">
      <PageContent className="page-padding">
        {/* Как и welcome, онбординг живёт без `PageHeader`, поэтому безопасные
            зоны добавляет сам: в PWA на iOS страница рисуется под часами. */}
        <div className="mx-auto flex min-h-full max-w-md flex-col pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-1 flex-col items-center justify-center gap-6">
            {/* The square source keeps the head and dumbbell inside every crop.
                Bound the frame's proportions instead of squeezing its height.
                Very short screens scroll so the photo and CTA stay reachable. */}
            <div className="aspect-square w-full max-w-[350px] shrink-0 overflow-hidden rounded-[30px] shadow-overlay [@media(min-height:800px)]:aspect-[350/517] [@media(max-height:640px)]:aspect-[4/3]">
              <img
                src={slide.image}
                alt={slide.imageAlt}
                className="h-full w-full object-cover"
                fetchPriority="high"
                width={1000}
                height={1000}
              />
            </div>
            <div className="flex w-full shrink-0 flex-col gap-4 text-center">
              <h1 className="text-h1 text-content">
                {slide.quote.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </h1>
              <p className="text-h3 text-muted">
                {slide.subtitle.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
            </div>
          </div>

          {/* Точки-индикаторы появляются только когда слайдов больше одного:
              на единственном слайде это был бы элемент управления, которым
              нечего переключать. */}
          {ONBOARDING_SLIDES.length > 1 && (
            <div className="mt-[25px] flex justify-center gap-[8px]" aria-hidden="true">
              {ONBOARDING_SLIDES.map((s, i) => (
                <span
                  key={s.id}
                  className={`size-[8px] rounded-full ${
                    i === index ? 'bg-brand-400' : 'bg-card-light'
                  }`}
                />
              ))}
            </div>
          )}

          <Button className="mt-6 shrink-0 shadow-raised" onClick={next}>
            Далее
          </Button>
        </div>
      </PageContent>
    </Page>
  );
}
