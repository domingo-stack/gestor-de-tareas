'use client';

import { useState } from 'react';
import { Toaster } from 'sonner';
import AuthGuard from '@/components/AuthGuard';
import ModuleGuard from '@/components/ModuleGuard';
import { usePermissions } from '@/context/PermissionsContext';
import {
  ViewColumnsIcon,
  TableCellsIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

import PipelineKanban from '@/components/crm/PipelineKanban';
import LeadsList from '@/components/crm/LeadsList';
import CrmReports from '@/components/crm/CrmReports';
import CrmConfig from '@/components/crm/CrmConfig';

type Tab = {
  id: 'pipeline' | 'lista' | 'reportes' | 'config';
  label: string;
  icon: typeof ViewColumnsIcon;
  superadminOnly?: boolean;
};

const TABS: Tab[] = [
  { id: 'pipeline', label: 'Pipeline', icon: ViewColumnsIcon },
  { id: 'lista', label: 'Lista', icon: TableCellsIcon },
  { id: 'reportes', label: 'Reportes', icon: ChartBarIcon },
  { id: 'config', label: 'Config', icon: Cog6ToothIcon, superadminOnly: true },
];

type TabId = Tab['id'];

export default function CrmPage() {
  const [activeTab, setActiveTab] = useState<TabId>('pipeline');
  const { role } = usePermissions();

  const visibleTabs = TABS.filter(t => !t.superadminOnly || role === 'superadmin');

  const renderTab = () => {
    switch (activeTab) {
      case 'pipeline': return <PipelineKanban />;
      case 'lista': return <LeadsList />;
      case 'reportes': return <CrmReports />;
      case 'config': return <CrmConfig />;
      default: return null;
    }
  };

  return (
    <AuthGuard>
      <ModuleGuard module="mod_crm">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CRM B2B</h1>
            <p className="text-gray-500 text-sm">Pipeline de leads, seguimiento y reportes de venta</p>
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
        <Toaster position="top-right" richColors />
      </ModuleGuard>
    </AuthGuard>
  );
}
