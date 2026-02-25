'use client'

import AuthGuard from '@/components/AuthGuard'
import ModuleGuard from '@/components/ModuleGuard'

export default function CustomerSuccessPage() {
  return (
    <AuthGuard>
      <ModuleGuard module="mod_customer_success">
        <div className="w-full h-[calc(100vh-56px)] overflow-hidden">
          <iframe
            src="https://kali-analitycs.vercel.app/?token=e3354ab5-d2c3-49ed-bd89-a916c690f130"
            width="100%"
            height="100%"
            frameBorder="0"
            style={{ border: 'none' }}
          />
        </div>
      </ModuleGuard>
    </AuthGuard>
  )
}
