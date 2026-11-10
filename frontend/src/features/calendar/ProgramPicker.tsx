import type { UseFormRegisterReturn } from 'react-hook-form';

import { usePrograms } from '@/entities/program/api/use-programs';
import { fieldClass } from '@/shared/ui/field';

export function ProgramPicker({ field }: { field: UseFormRegisterReturn }) {
  const programs = usePrograms();

  return (
    <div className="flex flex-col gap-[10px]">
      <label htmlFor="booking-program" className="text-body-m text-content">
        Программа тренировки
      </label>
      <select id="booking-program" className={`${fieldClass} text-h3`} {...field}>
        <option value="">Без программы</option>
        {programs.data?.map((program) => (
          <option key={program.id} value={program.id}>
            {program.name}
          </option>
        ))}
      </select>
    </div>
  );
}
