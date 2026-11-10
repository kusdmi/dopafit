import {
  ActionButton,
  ToolbarActions,
  PageContent,
  PageHeader,
  Icon,
  Page,
  PageTitle,
  Toolbar,
} from '@/shared/ui/primitives';
import { chevronBack, chevronForward } from '@/shared/ui/icons';
import { useState } from 'react';

import { useCancelEvent } from '@/entities/calendar/api/use-calendar-mutations';
import { useCalendarMonth } from '@/entities/calendar/api/use-calendar-month';
import { useSessionStore } from '@/entities/session/model/store';
import { paths } from '@/shared/config/paths';
import { useDelayedVisible } from '@/shared/lib/loading/useDelayedVisible';
import { BackButton } from '@/shared/ui/BackButton';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import type { components } from '@/shared/api/schema';
import { EventBookingModal } from '@/features/calendar/EventBookingModal';
import { EventEditModal } from '@/features/calendar/EventEditModal';
import { EventViewModal } from '@/features/calendar/EventViewModal';
import { MonthGrid } from '@/pages/calendar/month-grid/MonthGrid';

import { CalendarLegend, CalendarStats } from './ui/CalendarStats';
import { Panel } from './ui/Panel';
import { useMonthCursor } from './ui/useMonthCursor';

type EventOut = components['schemas']['EventOut'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export function CalendarPage() {
  const role = useSessionStore((s) => s.user?.role);
  const isTrainer = role === 'trainer';

  const now = new Date();
  const { year, month, prevMonth, nextMonth } = useMonthCursor(now);

  const { data, isLoading, isError } = useCalendarMonth(year, month);
  const showSkeleton = useDelayedVisible(isLoading);
  const cancelEvent = useCancelEvent();

  // Booking opens for the day picked (empty day) or for today via the trainer button.
  const [bookingDate, setBookingDate] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<EventOut | null>(null);

  const events = data?.events ?? [];
  // Отменённая запись остаётся в ответе месяца (её строка живёт в базе, см.
  // «keeps the cancelled event row»), но в сетке ей делать нечего: точка на дне
  // означает «тут есть тренировка», а отменённой тренировки нет. Раньше метка
  // не снималась и день выглядел занятым после отмены.
  const activeEvents = events.filter((e) => e.status !== 'cancelled');
  const eventsByDay = new Map<number, { hasPersonal: boolean; hasWithClients: boolean }>();
  for (const event of activeEvents) {
    const day = Number(event.date.slice(8, 10));
    const prev = eventsByDay.get(day) ?? { hasPersonal: false, hasWithClients: false };
    eventsByDay.set(day, {
      hasPersonal: prev.hasPersonal || event.type === 'personal',
      hasWithClients: prev.hasWithClients || event.type === 'with_clients',
    });
  }

  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const viewEvents = viewDate ? activeEvents.filter((e) => e.date === viewDate) : [];

  const handleDayClick = (iso: string) => {
    const dayEvents = activeEvents.filter((e) => e.date === iso);
    if (dayEvents.length > 0) {
      setViewDate(iso);
      return;
    }
    // На прошедший день записаться нельзя — расписание это обещание о том, что
    // будет, а вчерашний день его уже не примет (сервер тоже это отклоняет,
    // см. CalendarApplication.rejectPastDate). Пустой прошедший день просто не
    // открывает форму: показывать её, чтобы потом отказать ошибкой, значит
    // заставить заполнить форму впустую. Сегодняшний день прошедшим не
    // считается — вечерняя тренировка ещё впереди.
    if (iso < todayIso) return;
    setBookingDate(iso);
  };

  const safeRole: 'trainer' | 'client' = isTrainer ? 'trainer' : 'client';

  return (
    <Page background="gradient">
      <PageHeader transparent>
        <Toolbar>
          <BackButton to={paths.home} />
          <PageTitle className="text-h1 text-left">Календарь тренировок</PageTitle>
        </Toolbar>
      </PageHeader>
      <PageContent className="page-padding">
        <div className="mx-auto flex max-w-md flex-col gap-[10px]">
          {isLoading && showSkeleton && (
            <div className="animate-fade-in">
              <Skeleton variant="list" count={3} />
            </div>
          )}
          {isError && (
            <p className="py-8 text-center text-body-m text-danger">
              Не удалось загрузить календарь
            </p>
          )}

          {data && (
            <>
              {/* Ключ по месяцу перемонтирует блок при переключении, поэтому
                  короткий fade-in проигрывается заново: смена месяца — это
                  ответ на действие пользователя, и она должна быть видна.
                  `prefers-reduced-motion` учтён в самом `.animate-fade-in`. */}
              <div key={`${year}-${month}`} className="animate-fade-in">
                <CalendarStats stats={data.stats} isTrainer={isTrainer} />
              </div>

              <Panel className="flex flex-col gap-[10px]">
                <div className="flex items-center justify-between gap-[10px]">
                  <ToolbarActions>
                    <ActionButton onClick={prevMonth} aria-label="Предыдущий месяц">
                      <Icon slot="icon-only" icon={chevronBack} className="text-[24px]" />
                    </ActionButton>
                  </ToolbarActions>
                  <span className="text-h1 text-content">
                    {MONTH_NAMES[month - 1]} {year}
                  </span>
                  <ToolbarActions>
                    <ActionButton onClick={nextMonth} aria-label="Следующий месяц">
                      <Icon slot="icon-only" icon={chevronForward} className="text-[24px]" />
                    </ActionButton>
                  </ToolbarActions>
                </div>

                <div key={`${year}-${month}`} className="animate-fade-in">
                  <MonthGrid
                    year={year}
                    month={month}
                    eventsByDay={eventsByDay}
                    today={todayIso}
                    onDayClick={handleDayClick}
                  />
                </div>
              </Panel>

              {isTrainer && (
                <Button onClick={() => setBookingDate(todayIso)}>Записать клиента</Button>
              )}

              <CalendarLegend isTrainer={isTrainer} />
            </>
          )}
        </div>

        {bookingDate && (
          <EventBookingModal
            isOpen={bookingDate !== null}
            date={bookingDate}
            role={safeRole}
            onClose={() => setBookingDate(null)}
            onSubmitted={() => setBookingDate(null)}
          />
        )}

        {viewDate && (
          <EventViewModal
            isOpen={viewDate !== null}
            date={viewDate}
            today={todayIso}
            events={viewEvents}
            role={safeRole}
            cancelPending={cancelEvent.isPending}
            onClose={() => setViewDate(null)}
            onAddAnother={() => {
              const date = viewDate;
              setViewDate(null);
              setBookingDate(date);
            }}
            onEditEvent={(event) => {
              // Close the day view first so the edit modal is the only sheet open.
              setViewDate(null);
              setEditEvent(event);
            }}
            onCancelEvent={(id) => cancelEvent.mutate(id)}
          />
        )}

        {editEvent && (
          <EventEditModal
            isOpen={editEvent !== null}
            event={editEvent}
            role={safeRole}
            onClose={() => setEditEvent(null)}
            onSubmitted={() => setEditEvent(null)}
          />
        )}
      </PageContent>
    </Page>
  );
}
