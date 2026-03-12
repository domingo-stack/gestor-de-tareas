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

// Semanas Domingo-Sábado, UTC-5 (Perú)
function getSunday(d: Date): Date {
  const date = new Date(d);
  // Ajustar a UTC-5 para que el día se calcule en hora Perú
  const utc5 = new Date(date.getTime() - 5 * 60 * 60 * 1000);
  const day = utc5.getUTCDay(); // 0=Dom, 1=Lun, ...
  utc5.setUTCDate(utc5.getUTCDate() - day); // Retroceder al Domingo
  utc5.setUTCHours(0, 0, 0, 0);
  // Devolver como fecha local para display
  const result = new Date(utc5.getUTCFullYear(), utc5.getUTCMonth(), utc5.getUTCDate());
  result.setHours(0, 0, 0, 0);
  return result;
}

export function getCurrentWeekStart(): Date {
  return getSunday(new Date());
}

/** Convierte fecha local a string YYYY-MM-DD sin depender de timezone del browser */
export function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Convierte fecha local a ISO UTC que representa medianoche UTC-5 */
export function toUTC5Start(d: Date): string {
  return `${toDateStr(d)}T05:00:00.000Z`;
}

/** Convierte fecha local a ISO UTC que representa 23:59:59 UTC-5 */
export function toUTC5End(d: Date): string {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  return `${toDateStr(next)}T04:59:59.999Z`;
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
