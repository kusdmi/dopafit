import { Button } from '@/shared/ui/Button';

interface Props {
  archived: boolean;
  isOffline: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
  onUnlink: () => void;
}

/** Блок «Действия» карточки клиента: архивация и отвязка от аккаунта. */
export function ClientActions({
  archived,
  isOffline,
  onArchive,
  onUnarchive,
  onUnlink,
}: Props) {
  return (
    <div className="flex flex-col gap-[10px]">
      <h3 className="text-h3 text-muted">Действия</h3>
      <Button variant="outline" disabled={isOffline} onClick={archived ? onUnarchive : onArchive}>
        {archived ? 'Разархивировать' : 'Архивировать'}
      </Button>
      {/* «Отвязать клиента» — контурная кнопка ЖЁЛТОЙ роли (chart-5), не
          красной: так в макете, это не деструктивное действие.

          Роль сохранена, но цвет взят в тематическом варианте: фиксированный
          #FFD23F отлично читается в тёмной теме (10.61:1 на --card) и почти
          исчезает в светлой (1.27:1). `chart-5-text` держит тот же жёлтый в
          тёмной теме и затемнённую ступень того же тона в светлой (5.21:1). */}
      <Button
        variant="outline"
        className="border-chart-5-text text-chart-5-text"
        disabled={isOffline}
        onClick={onUnlink}
      >
        Отвязать клиента
      </Button>
    </div>
  );
}
