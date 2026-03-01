'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface WeekSelectorProps {
  weekStart: Date;
  onWeekChange: (newStart: Date) => void;
}

function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${start.toLocaleDateString('es-ES', opts)} - ${end.toLocaleDateString('es-ES', opts)}, ${end.getFullYear()}`;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getCurrentWeekStart(): Date {
  return getMonday(new Date());
}

export default function WeekSelector({ weekStart, onWeekChange }: WeekSelectorProps) {
  const goBack = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    onWeekChange(prev);
  };

  const goForward = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    const now = getCurrentWeekStart();
    if (next <= now) onWeekChange(next);
  };

  const isCurrentWeek = weekStart.getTime() === getCurrentWeekStart().getTime();

  return (
    <div className="flex items-center gap-3">
      <button onClick={goBack} className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
        <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
      </button>
      <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">
        {formatWeekRange(weekStart)}
      </span>
      <button onClick={goForward} disabled={isCurrentWeek} className={`p-1.5 rounded-md border border-gray-200 transition-colors ${isCurrentWeek ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}>
        <ChevronRightIcon className="w-4 h-4 text-gray-600" />
      </button>
      {!isCurrentWeek && (
        <button onClick={() => onWeekChange(getCurrentWeekStart())} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
          Hoy
        </button>
      )}
    </div>
  );
}
