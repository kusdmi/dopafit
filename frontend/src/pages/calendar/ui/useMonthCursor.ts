import { useState } from 'react';

export interface MonthCursor {
  year: number;
  /** 1..12 — как в API, а не 0-based как в Date. */
  month: number;
  prevMonth: () => void;
  nextMonth: () => void;
}

/** Курсор «год + месяц» с переносом через границу года. */
export function useMonthCursor(from: Date): MonthCursor {
  const [year, setYear] = useState(from.getFullYear());
  const [month, setMonth] = useState(from.getMonth() + 1);

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  return { year, month, prevMonth, nextMonth };
}
