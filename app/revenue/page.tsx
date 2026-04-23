'use client';

import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import ModuleGuard from '@/components/ModuleGuard';
import { usePermissions } from '@/context/PermissionsContext';
import {
  PresentationChartBarIcon,
  BanknotesIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  FunnelIcon,
  MegaphoneIcon,
  ChartBarSquareIcon,
  DocumentTextIcon,
  TableCellsIcon,
  StarIcon,
} from '@heroicons/react/24/outline';

import ExecutiveSummary from '@/components/growth/ExecutiveSummary';
import NsmAnalysis from '@/components/growth/NsmAnalysis';
import OperacionalTab from '@/components/growth/OperacionalTab';
import RevenueTab from '@/components/growth/RevenueTab';
import RevenueByCountry from '@/components/growth/RevenueByCountry';
import ChurnRenewal from '@/components/growth/ChurnRenewal';
import ConversionFunnel from '@/components/growth/ConversionFunnel';
import AcquisitionTab from '@/components/growth/AcquisitionTab';
import RetentionCohort from '@/components/growth/RetentionCohort';
import ReportConfig from '@/components/growth/ReportConfig';

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: PresentationChartBarIcon },
  { id: 'nsm', label: 'NSM (7+)', icon: StarIcon },
  { id: 'operacional', label: 'Operacional', icon: TableCellsIcon },
  { id: 'revenue', label: 'Revenue', icon: BanknotesIcon },
  { id: 'pais', label: 'Por Pais', icon: GlobeAltIcon },
  { id: 'churn', label: 'Churn & Renovacion', icon: ArrowPathIcon },
  { id: 'conversion', label: 'Conversion', icon: FunnelIcon },
  { id: 'adquisicion', label: 'Adquisicion', icon: MegaphoneIcon },
  { id: 'comportamiento', label: 'Comportamiento', icon: ChartBarSquareIcon },
  { id: 'reportes', label: 'Reportes', icon: DocumentTextIcon, superadminOnly: true },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function GrowthDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const { role } = usePermissions();

  const visibleTabs = TABS.filter(t => !t.superadminOnly || role === 'superadmin');

  const renderTab = () => {
    switch (activeTab) {
      case 'resumen': return <ExecutiveSummary />;
      case 'nsm': return <NsmAnalysis />;
      case 'operacional': return <OperacionalTab />;
      case 'revenue': return <RevenueTab />;
      case 'pais': return <RevenueByCountry />;
      case 'churn': return <ChurnRenewal />;
      case 'conversion': return <ConversionFunnel />;
      case 'adquisicion': return <AcquisitionTab />;
      case 'comportamiento': return <RetentionCohort />;
      case 'reportes': return <ReportConfig />;
      default: return null;
    }
  };

  return (
    <AuthGuard>
      <ModuleGuard module="mod_revenue">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Growth Dashboard</h1>
            <p className="text-gray-500 text-sm">Metricas de crecimiento, revenue y comportamiento</p>
          </div>

          {/* Tab navigation */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Tabs">
              {visibleTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group inline-flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <tab.icon className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab content */}
          <div>{renderTab()}</div>
        </div>
      </ModuleGuard>
    </AuthGuard>
  );
}
