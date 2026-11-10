import { ActionButton, Icon } from '@/shared/ui/primitives';
import { eyeOffOutline, eyeOutline } from '@/shared/ui/icons';

interface PasswordToggleProps {
  revealed: boolean;
  onToggle: () => void;
}

/** Кнопка-глаз показать/скрыть пароль. absolute по центру строки поля
 *  (см. .app-eye в index.css); на высоту поля не влияет. */
export function PasswordToggle({ revealed, onToggle }: PasswordToggleProps) {
  return (
    <ActionButton
      type="button"
      fill="clear"
      className="app-eye"
      aria-label={revealed ? 'Скрыть пароль' : 'Показать пароль'}
      onClick={onToggle}
    >
      <Icon slot="icon-only" icon={revealed ? eyeOffOutline : eyeOutline} aria-hidden="true" />
    </ActionButton>
  );
}
