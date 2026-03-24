'use client';

import { DateRange } from './shared/useDateRange';
import OrganicOverview from './organic/OrganicOverview';
import PostsFeed from './organic/PostsFeed';
import YouTubeMetrics from './organic/YouTubeMetrics';

interface OrganicTabProps {
  range: DateRange;
}

export default function OrganicTab({ range }: OrganicTabProps) {
  return (
    <div className="space-y-6">
      <OrganicOverview range={range} />
      <PostsFeed range={range} />
      <section>
        <h4 className="text-sm font-semibold text-gray-600 mb-3">YouTube — Detalle</h4>
        <YouTubeMetrics range={range} />
      </section>
    </div>
  );
}
