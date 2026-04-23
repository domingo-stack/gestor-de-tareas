'use client';

import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import ModuleGuard from '@/components/ModuleGuard';
import { SparklesIcon, ClockIcon } from '@heroicons/react/24/outline';
import BlogList from '@/components/contenido-social/BlogList';
import HistoryTable from '@/components/contenido-social/HistoryTable';

const TABS = [
  { id: 'blogs', label: 'Blogs', icon: SparklesIcon },
  { id: 'historial', label: 'Historial', icon: ClockIcon },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ContenidoSocialPage() {
  const [activeTab, setActiveTab] = useState<TabId>('blogs');

  return (
    <AuthGuard>
      <ModuleGuard module="mod_contenido_social">
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contenido Social</h1>
            <p className="text-gray-500 text-sm">Genera carruseles y piezas de contenido a partir de blogs con IA</p>
          </div>

          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-1" aria-label="Tabs">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`group inline-flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                      isActive ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}>
                    <tab.icon className={`w-4 h-4 ${isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div>
            {activeTab === 'blogs' && <BlogList />}
            {activeTab === 'historial' && <HistoryTable />}
          </div>
        </div>
      </ModuleGuard>
    </AuthGuard>
  );
}
