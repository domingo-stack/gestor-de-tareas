'use client';

import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import ModuleGuard from '@/components/ModuleGuard';
import { usePermissions } from '@/context/PermissionsContext';
import { useDateRange } from '@/components/marketing/shared/useDateRange';
import DateRangePicker from '@/components/marketing/shared/DateRangePicker';
import {
  PresentationChartBarIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  HeartIcon,
  ShoppingCartIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

import ResumenTab from '@/components/marketing/ResumenTab';
import AdsOverview from '@/components/marketing/ads/AdsOverview';
import WebAnalytics from '@/components/marketing/web/WebAnalytics';
import OrganicTab from '@/components/marketing/OrganicTab';
import ConversionsSection from '@/components/marketing/conversions/ConversionsSection';
import SyncTab from '@/components/marketing/SyncTab';

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: PresentationChartBarIcon },
  { id: 'ads', label: 'Ads', icon: CurrencyDollarIcon },
  { id: 'web', label: 'Web y Blog', icon: GlobeAltIcon },
  { id: 'organico', label: 'Orgánico', icon: HeartIcon },
  { id: 'conversiones', label: 'Conversiones', icon: ShoppingCartIcon },
  { id: 'sync', label: 'Sync', icon: ArrowPathIcon, superadminOnly: true },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const { role } = usePermissions();
  const { preset, setPreset, range, customFrom, customTo, setCustomFrom, setCustomTo } = useDateRange();

  const isSuperadmin = role === 'superadmin';
  const visibleTabs = TABS.filter(t => !t.superadminOnly || isSuperadmin);

  const renderTab = () => {
    switch (activeTab) {
      case 'resumen': return <ResumenTab range={range} />;
      case 'ads': return <AdsOverview range={range} />;
      case 'web': return <WebAnalytics range={range} />;
      case 'organico': return <OrganicTab range={range} />;
      case 'conversiones': return <ConversionsSection range={range} />;
      case 'sync': return <SyncTab />;
      default: return null;
    }
  };

  return (
    <AuthGuard>
      <ModuleGuard module="mod_marketing">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          {isSuperadmin ? (
            <>
              {/* Header */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
                  <p className="text-gray-500 text-sm">Performance, orgánico, web y conversiones</p>
                </div>
                {activeTab !== 'sync' && (
                  <DateRangePicker
                    preset={preset}
                    onPresetChange={setPreset}
                    customFrom={customFrom}
                    customTo={customTo}
                    onCustomFromChange={setCustomFrom}
                    onCustomToChange={setCustomTo}
                  />
                )}
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
            </>
          ) : (
            /* Member/Invitado: solo orgánico sin tab bar */
            <>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Contenido Orgánico</h1>
                  <p className="text-gray-500 text-sm">Métricas de alcance, engagement y crecimiento por plataforma</p>
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
              <OrganicTab range={range} />
            </>
          )}
        </div>
      </ModuleGuard>
    </AuthGuard>
  );
}
