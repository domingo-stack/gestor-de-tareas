'use client'

import { useState } from 'react'
import AuthGuard from '@/components/AuthGuard'
import ModuleGuard from '@/components/ModuleGuard'
import PagosFallidos from '@/components/customer-success/PagosFallidos'
import NPSDashboard from '@/components/customer-success/NPSDashboard'
import PMFDashboard from '@/components/customer-success/PMFDashboard'
import FeatureRequests from '@/components/customer-success/FeatureRequests'
import { Toaster } from 'sonner'

type TabKey = 'pagos' | 'nps' | 'pmf' | 'feature_requests' | 'kali'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'pagos', label: 'Pagos Fallidos' },
  { key: 'nps', label: 'NPS' },
  { key: 'pmf', label: 'PMF' },
  { key: 'feature_requests', label: 'Feature Requests' },
  { key: 'kali', label: 'Kali Analytics' },
]

export default function CustomerSuccessPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('pagos')

  return (
    <AuthGuard>
      <ModuleGuard module="mod_customer_success">
        <div className={activeTab === 'kali' ? 'h-full flex flex-col overflow-hidden' : ''}>
          <div className={activeTab === 'kali' ? 'px-4 pt-4' : 'max-w-7xl mx-auto p-4 md:p-8'}>
            <Toaster position="top-right" richColors />

            {activeTab !== 'kali' && (
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold" style={{ color: '#383838' }}>
                  Customer Success
                </h1>
              </div>
            )}

            {/* Tabs */}
            <div className={`flex gap-1 ${activeTab === 'kali' ? 'mb-3' : 'mb-6'} bg-gray-100 rounded-lg p-1 w-fit`}>
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            {activeTab === 'pagos' && <PagosFallidos />}
            {activeTab === 'nps' && <NPSDashboard />}
            {activeTab === 'pmf' && <PMFDashboard />}
            {activeTab === 'feature_requests' && <FeatureRequests />}
          </div>

          {activeTab === 'kali' && (
            <div className="flex-1 overflow-hidden">
              <iframe
                src="https://kali-analitycs.vercel.app/?token=e3354ab5-d2c3-49ed-bd89-a916c690f130"
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 'none' }}
              />
            </div>
          )}
        </div>
      </ModuleGuard>
    </AuthGuard>
  )
}
