import { useMeasurement } from '@/entities/measurement/api/use-measurement';
import { PrivatePhoto } from '@/entities/measurement/ui/PrivatePhoto';
import {
  ALL_FIELDS,
  FIELD_LABELS,
  PHOTO_KINDS,
  PHOTO_LABELS,
} from '@/entities/measurement/model/fields';
import type { MeasurementField, PhotoKind } from '@/entities/measurement/model/fields';
import { unitFor } from '@/entities/measurement/model/summary';
import type { components } from '@/shared/api/schema';
import { formatDateFull } from '@/shared/lib/time/formatDate';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';
import { Skeleton } from '@/shared/ui/Skeleton';

import { ValueTile } from './ValueTile';

type MeasurementOut = components['schemas']['MeasurementOut'];

interface Props {
  id: string | null;
  isOpen: boolean;
  onClose: () => void;
  onLoad: (record: MeasurementOut) => void;
  onDelete: (record: MeasurementOut) => void;
  isOnline: boolean;
}

export function MeasurementDetailModal({
  id,
  isOpen,
  onClose,
  onLoad,
  onDelete,
  isOnline,
}: Props) {
  const { data, isLoading } = useMeasurement(id);
  // Наблюдение B-2: при закрытии модала родитель сбрасывает id → null, запрос
  // «выключается» (data=null, isLoading=false) и на кадр мелькает «Запись не
  // найдена», пока идёт анимация закрытия. Показываем error-состояние ТОЛЬКО
  // когда модал открыт и есть реальный id — в переходе держим скелетон.
  const inTransition = !isOpen || id == null;

  const handleLoad = () => {
    if (data) {
      onLoad(data);
      onClose();
    }
  };

  // Макет 758:2726 рисует четыре основных поля, но запись хранит ещё обхваты и
  // кастомные поля. Показываем ВСЁ, что реально записано, одной сеткой тех же
  // плиток: иначе часть замера не видна нигде, кроме режима редактирования.
  // Порядок — канонический ALL_FIELDS (основные, затем дополнительные), потом
  // кастомные; пустые поля пропускаются.
  const tiles = data
    ? [
        ...ALL_FIELDS.filter((f) => data[f] != null).map((f: MeasurementField) => ({
          key: f,
          label: FIELD_LABELS[f],
          value: `${data[f]} ${unitFor(f)}`,
        })),
        ...(data.custom_values ?? []).map((cv) => ({
          key: `custom-${cv.slot}`,
          label: cv.name,
          value: `${cv.value} ${cv.unit}`,
        })),
      ]
    : [];

  // Photos in canonical order (front, back, left, right) so the preview layout is stable.
  const photoFor = (kind: PhotoKind) => data?.photos?.find((p) => p.kind === kind);
  const photos = data ? PHOTO_KINDS.map(photoFor).filter((p) => p != null) : [];

  const footer = data ? (
    <div className="flex flex-wrap gap-3">
      <Button variant="primary" type="button" onClick={handleLoad}>
        Загрузить для редактирования
      </Button>
      <Button
        variant="outline"
        color="danger"
        type="button"
        disabled={!isOnline}
        title={!isOnline ? 'Недоступно офлайн' : undefined}
        onClick={() => onDelete(data)}
      >
        Удалить замер
      </Button>
    </div>
  ) : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      // Заголовок макета — «Запись за 23 января 2026», то есть дата стоит в
      // шапке модалки, а не отдельным <h2> внутри. Пока запись не приехала,
      // держим нейтральное «Замер»: подставлять дату неоткуда.
      title={data ? `Запись за ${formatDateFull(data.date)}` : 'Замер'}
      footer={footer}
      variant="popup"
    >
      {isLoading || inTransition ? (
        <Skeleton variant="card" />
      ) : data ? (
        <div className="flex flex-col gap-[15px]">
          {tiles.length > 0 && (
            <section className="flex flex-col gap-[15px]">
              <h3 className="text-h2 text-content">Основные изменения</h3>
              {/* Две колонки, как в макете; зазоры 30px по горизонтали и 15px
                  по вертикали. На узком экране колонки не схлопываем — плитка
                  короткая («Рост» / «175 см»), и в один столбец список
                  вытянулся бы вдвое. */}
              <div className="grid grid-cols-2 gap-x-[30px] gap-y-[15px]">
                {tiles.map((t) => (
                  <ValueTile key={t.key} label={t.label} value={t.value} />
                ))}
              </div>
            </section>
          )}

          {photos.length > 0 && (
            <section className="flex flex-col gap-[10px]">
              <h3 className="text-h2 text-content">Фотографии</h3>
              <div className="grid grid-cols-2 gap-2">
                {photos.map((p) => (
                  <figure key={p.kind} className="flex flex-col gap-1">
                    {/* Превью в сетке 2×2 — около 160–180 CSS-px, а с сервера
                        приходит полноразмерное фото (до 1600px): без lazy все
                        до четырёх качаются сразу при открытии модалки, хотя
                        нижний ряд обычно вне вьюпорта. `decoding="async"`
                        снимает декодирование с главного потока, чтобы оно не
                        подмораживало прокрутку модалки. Тот же приём уже
                        применён в entities/exercise/ui/ExerciseMedia.tsx. */}
                    <PrivatePhoto
                      url={p.url}
                      alt={PHOTO_LABELS[p.kind]}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full rounded-card border border-line object-cover"
                    />
                    <figcaption className="text-caption text-center text-muted">
                      {PHOTO_LABELS[p.kind]}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <p className="text-center text-muted">Запись не найдена</p>
      )}
    </Modal>
  );
}
