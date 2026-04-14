'use client';

import { ArrowTrendingUpIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

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
  tooltip?: string;
}

export default function KpiCard({ title, value, subtext, icon: Icon, colorClass, growth, loading, tooltip }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm flex items-start justify-between">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {tooltip && (
            <div className="relative group">
              <InformationCircleIcon className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 cursor-help transition-colors" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 bg-gray-800 text-white text-[11px] leading-relaxed rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 pointer-events-none">
                {tooltip}
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[5px] border-x-transparent border-t-[5px] border-t-gray-800" />
              </div>
            </div>
          )}
        </div>
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
