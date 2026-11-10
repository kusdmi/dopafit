import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Modal';

import type { CustomDiffRow, DiffRow } from './diff';

interface Props {
  rows: DiffRow[];
  customRows?: CustomDiffRow[];
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DuplicateDialog({ rows, customRows = [], isOpen, onCancel, onConfirm }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Изменения замера"
      footer={
        <div className="flex gap-3">
          <Button variant="outline" type="button" onClick={onCancel}>
            Отмена
          </Button>
          <Button variant="primary" type="button" onClick={onConfirm}>
            Подтвердить
          </Button>
        </div>
      }
      variant="popup"
    >
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.field} className="text-body-s flex justify-between">
            <span className="text-muted">{r.label}</span>
            <span>
              {r.before ?? '—'} <span className="text-muted">→</span> {r.after ?? '—'}
            </span>
          </li>
        ))}
        {customRows.map((r) => (
          <li key={`custom-${r.slot}`} className="text-body-s flex justify-between">
            <span className="text-muted">
              {/* Surface a rename/unit-only edit too, not just the value. */}
              {r.labelBefore != null ? (
                <>
                  {r.labelBefore} <span className="text-muted">→</span> {r.label}
                </>
              ) : (
                r.label
              )}
              {r.unitBefore != null ? (
                <>
                  {' '}
                  <span className="text-muted">(</span>
                  {r.unitBefore || '—'} <span className="text-muted">→</span> {r.unit || '—'}
                  <span className="text-muted">)</span>
                </>
              ) : r.unit ? (
                `, ${r.unit}`
              ) : (
                ''
              )}
            </span>
            <span>
              {r.before ?? '—'} <span className="text-muted">→</span> {r.after ?? '—'}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
