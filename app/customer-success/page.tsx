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
              src="https://kali-analitycs.vercel.app/?token=e3354ab5-d2c3-49ed-bd89-a916c690f130&embed=true"
              width="100%"
              height="1200"
              frameBorder="0"
              style={{ border: 'none', borderRadius: '12px' }}
            />
          </div>
        </div>
      </ModuleGuard>
    </AuthGuard>
  )
}
