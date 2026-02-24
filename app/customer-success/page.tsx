'use client'

import AuthGuard from '@/components/AuthGuard'
import ModuleGuard from '@/components/ModuleGuard'

export default function CustomerSuccessPage() {
  return (
    <AuthGuard>
      <ModuleGuard module="mod_customer_success">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          <h1 className="text-2xl font-bold mb-6" style={{ color: '#383838' }}>
            Customer Success
          </h1>
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <iframe
              src="https://kali-analitycs.vercel.app/"
              width="100%"
              height="1400px"
              style={{ border: 'none' }}
            />
          </div>
        </div>
      </ModuleGuard>
    </AuthGuard>
  )
}
