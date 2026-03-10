'use client';

import { useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import ModuleGuard from '@/components/ModuleGuard';
import Campanias from '@/components/comunicaciones/Campanias';
import Templates from '@/components/comunicaciones/Templates';
import Automatizaciones from '@/components/comunicaciones/Automatizaciones';
import Metricas from '@/components/comunicaciones/Metricas';
import Configuracion from '@/components/comunicaciones/Configuracion';

const TABS = [
  { id: 'campanias',        label: 'Campañas' },
  { id: 'templates',        label: 'Templates' },
  { id: 'automatizaciones', label: 'Automatizaciones' },
  { id: 'metricas',         label: 'Métricas' },
  { id: 'configuracion',    label: 'Configuración' },
] as const;

type TabId = typeof TABS[number]['id'];

export default function ComunicacionesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('campanias');

  return (
    <AuthGuard>
      <ModuleGuard module="mod_comunicaciones">
        <div className="flex flex-col h-full min-h-screen bg-[#F8F8F8]">
          <div className="bg-white border-b border-gray-200 px-6 pt-6 pb-0">
            <h1 className="text-xl font-bold text-[#383838] mb-4">Comunicaciones</h1>
            <div className="flex gap-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#ff8080] text-[#ff8080] bg-red-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-6">
            {activeTab === 'campanias'        && <Campanias />}
            {activeTab === 'templates'        && <Templates />}
            {activeTab === 'automatizaciones' && <Automatizaciones />}
            {activeTab === 'metricas'         && <Metricas />}
            {activeTab === 'configuracion'    && <Configuracion />}
          </div>
        </div>
      </ModuleGuard>
    </AuthGuard>
  );
}
