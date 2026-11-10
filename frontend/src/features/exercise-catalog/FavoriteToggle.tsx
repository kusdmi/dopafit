import { Icon } from '@/shared/ui/primitives';
import { star, starOutline } from '@/shared/ui/icons';

import { useSetFavorite } from '@/entities/exercise/api/use-set-favorite';

interface Props {
  id: string;
  isFavorite: boolean;
}

// В макете (958:2979) отметка избранного — контурное сердце; в reexport'е
// shared/ui/icons.ts сердца нет, а заводить новую иконку в общем модуле в этой
// задаче нельзя, поэтому берём ближайшую по смыслу звезду (design-system.md:
// «совпадение по смыслу достаточно, попиксельное соответствие не требуется»).
// Заполненная/контурная пара сохраняет состояние не только цветом.
export function FavoriteToggle({ id, isFavorite }: Props) {
  const setFavorite = useSetFavorite();
  return (
    <button
      type="button"
      aria-label={isFavorite ? 'Убрать из избранного' : 'В избранное'}
      aria-pressed={isFavorite}
      onClick={() => setFavorite.mutate({ id, isFavorite: !isFavorite })}
      className={`flex size-[44px] shrink-0 items-center justify-center ${
        isFavorite ? 'text-brand-text' : 'text-muted'
      }`}
    >
      {/* Заливка через утилиту, а не через prop: примитив Icon пробрасывает
          только HTML-атрибуты, а `fill` у него в типах нет. */}
      <Icon
        icon={isFavorite ? star : starOutline}
        className={`text-[20px] ${isFavorite ? 'fill-current' : 'fill-none'}`}
      />
    </button>
  );
}
