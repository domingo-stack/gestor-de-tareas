'use client';

import { useDateRange } from './shared/useDateRange';
import DateRangePicker from './shared/DateRangePicker';
import OrganicOverview from './organic/OrganicOverview';
import YouTubeMetrics from './organic/YouTubeMetrics';

export default function OrganicDashboard() {
  const { preset, setPreset, range, customFrom, customTo, setCustomFrom, setCustomTo } = useDateRange();

  return (
    <div className="space-y-8">
      {/* Header + Date filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Contenido Orgánico</h2>
          <p className="text-xs text-gray-400">Métricas de alcance, engagement y crecimiento por plataforma</p>
        </div>
        <DateRangePicker
          preset={preset}
          onPresetChange={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
        />
      </div>

      {/* Overview cards for all platforms */}
      <OrganicOverview range={range} />

      {/* YouTube detailed section */}
      <section>
        <h3 className="text-base font-semibold text-gray-700 mb-4">YouTube — Detalle</h3>
        <YouTubeMetrics range={range} />
      </section>
    </div>
  );
}
