'use client';

import { ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  colorClass: string;
  growth?: {
    percent: number;
    isPositive: boolean;
  };
  loading?: boolean;
}

export default function KpiCard({ title, value, subtext, icon: Icon, colorClass, growth, loading }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-gray-900 tracking-tight">
          {loading ? '...' : value}
        </h3>
        {growth ? (
          <div className={`flex items-center mt-2 text-xs font-medium ${growth.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            <ArrowTrendingUpIcon className={`w-3 h-3 mr-1 ${!growth.isPositive && 'rotate-180'}`} />
            <span>{growth.percent.toFixed(1)}%</span>
            <span className="text-gray-400 ml-1 font-normal">vs periodo anterior</span>
          </div>
        ) : (
          subtext && <p className="text-xs text-gray-400 mt-2">{subtext}</p>
        )}
      </div>
      <div className={`p-3 rounded-lg ${colorClass} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
      </div>
    </div>
  );
}
