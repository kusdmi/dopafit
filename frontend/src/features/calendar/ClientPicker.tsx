import { Icon } from '@/shared/ui/primitives';
import { peopleOutline } from '@/shared/ui/icons';

interface Client {
  id: string;
  display_name: string;
}

interface Props {
  clients: Client[];
  selected: string[];
  onToggle: (id: string) => void;
}

// Список клиентов в модалке записи (Figma 392:4474): подпись «Клиенты» с иконкой,
// затем строки-чекбоксы — квадрат 20×20 с радиусом 5px, залитый акцентом когда
// выбран. Общий на форму создания и форму правки, чтобы обе выглядели одинаково.
export function ClientPicker({ clients, selected, onToggle }: Props) {
  return (
    <div className="flex flex-col gap-[10px]">
      <p className="flex items-center gap-[10px] text-body-m text-content">
        <Icon icon={peopleOutline} className="text-[24px] text-muted" />
        Клиенты
      </p>
      <ul className="flex flex-col gap-[10px]">
        {clients.map((client) => {
          const checked = selected.includes(client.id);
          return (
            <li key={client.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => onToggle(client.id)}
                className={`flex w-full items-center gap-[10px] rounded-[14px] border-2 bg-card p-[10px] text-left text-body-m text-content ${
                  checked ? 'border-brand-400' : 'border-neutral-500'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-5 shrink-0 rounded-[5px] border-2 ${
                    checked ? 'border-brand-400 bg-brand-400' : 'border-neutral-500'
                  }`}
                />
                {client.display_name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
