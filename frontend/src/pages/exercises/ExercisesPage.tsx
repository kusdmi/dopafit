import { useCallback, useEffect, useState } from 'react';
import { PageContent, PageHeader, Icon, Page, PageTitle, Toolbar } from '@/shared/ui/primitives';
import { star, starOutline, chevronForward } from '@/shared/ui/icons';
import { Link, useLocation } from 'react-router-dom';

import { useCategories } from '@/entities/exercise/api/use-categories';
import { ExerciseList } from '@/entities/exercise/ui/ExerciseList';
import { DIFFICULTY_CLASS, DIFFICULTY_LABEL } from '@/entities/exercise/model/difficulty';
import { CategoryFilter } from '@/features/exercise-catalog/CategoryFilter';
import { ExerciseSearch } from '@/features/exercise-catalog/ExerciseSearch';
import { FavoriteToggle } from '@/features/exercise-catalog/FavoriteToggle';
import { paths, exercise } from '@/shared/config/paths';
import { BackButton } from '@/shared/ui/BackButton';
import type { components } from '@/shared/api/schema';

type ExerciseListItem = components['schemas']['ExerciseListItem'];

// React Router restores the location on Back, but the catalogue scrolls inside
// PageContent rather than the document. Keep its position for that history entry.
const filters = new Map<
  string,
  { search: string; categoryId: string | null; favoritesOnly: boolean }
>();
const scrollPositions = new Map<string, number>();
function rememberScroll(key: string, top: number) {
  if (!scrollPositions.has(key) && scrollPositions.size >= 20)
    scrollPositions.delete(scrollPositions.keys().next().value!);
  scrollPositions.set(key, top);
}

function ExerciseRow({
  item,
  index,
  category,
}: {
  item: ExerciseListItem;
  index: number;
  category?: string;
}) {
  return (
    <div className="flex h-full items-center gap-[5px] border-l-2 border-line pl-[10px]">
      <span
        aria-hidden="true"
        className="flex size-[40px] shrink-0 items-center justify-center rounded-[14px] border border-brand-400 text-h2 text-brand-text"
      >
        {index}
      </span>
      <Link
        to={exercise(item.id)}
        className="flex min-w-0 flex-1 items-center justify-between gap-[10px] p-[10px]"
      >
        <span className="flex min-w-0 flex-col gap-[5px]">
          <span className="line-clamp-2 text-body-m text-content">{item.name}</span>
          {category && <span className="truncate text-caption text-muted">{category}</span>}
          <span className="flex flex-wrap items-center gap-[5px]">
            <span className="text-caption text-muted">Сложность:</span>
            <span className={`text-tag ${DIFFICULTY_CLASS[item.difficulty]}`}>
              {DIFFICULTY_LABEL[item.difficulty]}
            </span>
          </span>
        </span>
        <Icon icon={chevronForward} className="shrink-0 text-[20px] text-muted" />
      </Link>
      <FavoriteToggle id={item.id} isFavorite={item.is_favorite} />
    </div>
  );
}

export function ExercisesPage() {
  const location = useLocation();
  const [search, setSearch] = useState(filters.get(location.key)?.search ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(
    filters.get(location.key)?.categoryId ?? null,
  );
  const [favoritesOnly, setFavoritesOnly] = useState(
    filters.get(location.key)?.favoritesOnly ?? false,
  );
  useEffect(() => {
    if (!filters.has(location.key) && filters.size >= 20)
      filters.delete(filters.keys().next().value!);
    filters.set(location.key, { search, categoryId, favoritesOnly });
  }, [location.key, search, categoryId, favoritesOnly]);
  const categories = useCategories();
  const [total, setTotal] = useState<number | null>(null);
  const onTotal = useCallback((count: number) => setTotal(count), []);
  const filterKey = JSON.stringify([search, categoryId, favoritesOnly]);
  const changeSearch = (value: string) => {
    if (value === search) return;
    setSearch(value);
    setTotal(null);
    scrollPositions.delete(location.key);
  };
  const changeCategory = (value: string | null) => {
    if (value === categoryId) return;
    setCategoryId(value);
    setTotal(null);
    scrollPositions.delete(location.key);
  };
  return (
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <BackButton to={paths.programs} />
          <PageTitle className="text-h1 text-left">Все упражнения</PageTitle>
          <button
            type="button"
            onClick={() => {
              setFavoritesOnly((v) => !v);
              setTotal(null);
              scrollPositions.delete(location.key);
            }}
            aria-pressed={favoritesOnly}
            data-active={favoritesOnly}
            aria-label="Избранное"
            className={`flex size-[44px] shrink-0 items-center justify-center ${
              favoritesOnly ? 'text-brand-text' : 'text-content'
            }`}
          >
            <Icon
              icon={favoritesOnly ? star : starOutline}
              className={`text-[20px] ${favoritesOnly ? 'fill-current' : 'fill-none'}`}
            />
          </button>
        </Toolbar>
      </PageHeader>
      <PageContent
        className="page-padding"
        onScroll={(event) => {
          if (total !== null) rememberScroll(location.key, event.currentTarget.scrollTop);
        }}
        restoreScrollTop={total === null ? undefined : scrollPositions.get(location.key)}
      >
        <div className="mx-auto flex max-w-md flex-col gap-[15px]">
          <ExerciseSearch value={search} onChange={changeSearch} />
          <CategoryFilter
            categories={categories.data ?? []}
            selected={categoryId}
            onSelect={changeCategory}
          />

          {total !== null && <span className="text-body-s text-muted">Найдено: {total}</span>}
          <ExerciseList
            key={filterKey}
            filter={{ search, categoryId: categoryId ?? undefined, favoritesOnly }}
            onTotal={onTotal}
            renderItem={(item, index) => (
              <ExerciseRow
                item={item}
                index={index + 1}
                category={
                  categories.data?.find((category) => category.id === item.category_id)?.name
                }
              />
            )}
          />
        </div>
      </PageContent>
    </Page>
  );
}
