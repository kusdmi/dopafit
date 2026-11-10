import { env } from '@/shared/config/env';

async function nativeWebPath(): Promise<string | null> {
  const { ActionSheet } = await import('@capacitor/action-sheet');
  const { Camera } = await import('@capacitor/camera');
  // 0 = камера, 1 = галерея, 2 = отмена (−1 — свайп-дисмисс листа).
  const { index } = await ActionSheet.showActions({
    title: 'Добавить фото',
    options: [{ title: 'Снять фото' }, { title: 'Из галереи' }, { title: 'Отмена' }],
  });
  if (index === 0) {
    const result = await Camera.takePhoto({ quality: 90 });
    return result.webPath ?? null;
  }
  if (index === 1) {
    const { results } = await Camera.chooseFromGallery({ quality: 90 });
    return results[0]?.webPath ?? null;
  }
  return null; // отмена
}

async function pickNative(): Promise<Blob | null> {
  try {
    const webPath = await nativeWebPath();
    if (!webPath) return null;
    const res = await fetch(webPath);
    return await res.blob();
  } catch {
    // Отмена камеры/листа кидает — трактуем как «ничего не выбрано».
    return null;
  }
}

function pickWeb(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
    });
    // Известное ограничение web: отмена диалога не шлёт событие, поэтому Promise при
    // отмене не резолвится (детач-input соберёт GC). Для разового выбора приемлемо;
    // native-ветка отмену обрабатывает явно.
    input.click();
  });
}

/** Снять/выбрать фото. Native — нативная камера/галерея; web — <input type=file>. */
export function pickPhoto(): Promise<Blob | null> {
  return env.isNative ? pickNative() : pickWeb();
}
