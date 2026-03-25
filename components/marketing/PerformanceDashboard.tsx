'use client';

import { useDateRange } from './shared/useDateRange';
import DateRangePicker from './shared/DateRangePicker';
import AdsOverview from './ads/AdsOverview';
import OrganicOverview from './organic/OrganicOverview';
import YouTubeMetrics from './organic/YouTubeMetrics';
import WebAnalytics from './web/WebAnalytics';
import ConversionsSection from './conversions/ConversionsSection';

export default function PerformanceDashboard() {
  const { preset, setPreset, range, customFrom, customTo, setCustomFrom, setCustomTo } = useDateRange();

  return (
    <div className="space-y-8">
      {/* Header + Date filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Performance Marketing</h2>
          <p className="text-xs text-gray-400">Vista completa: ads pagados + orgánico + web + conversiones</p>
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

      {/* Section 1: Ads pagados */}
      <section>
        <h3 className="text-base font-semibold text-gray-700 mb-4">Ads Pagados</h3>
        <AdsOverview range={range} />
      </section>

      {/* Section 2: Orgánico */}
      <section>
        <h3 className="text-base font-semibold text-gray-700 mb-4">Contenido Orgánico</h3>
        <OrganicOverview range={range} />
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-600 mb-3">YouTube — Detalle</h4>
          <YouTubeMetrics range={range} />
        </div>
      </section>

      {/* Section 3: Web y Blog (GA4) */}
      <section>
        <h3 className="text-base font-semibold text-gray-700 mb-4">Web y Blog</h3>
        <WebAnalytics range={range} />
      </section>

      {/* Section 4: Conversiones */}
      <section>
        <h3 className="text-base font-semibold text-gray-700 mb-4">Conversiones</h3>
        <ConversionsSection range={range} />
      </section>
    </div>
  );
}
