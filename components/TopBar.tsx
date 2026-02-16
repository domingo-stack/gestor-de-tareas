'use client'

import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import Notifications from '@/components/Notifications'

export default function TopBar() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <div className="flex items-center justify-end h-14 px-4 md:px-6 border-b border-gray-200 bg-white shrink-0">
      <div className="flex items-center gap-3">
        <Notifications />
        <Image
          src="/logo-califica.svg"
          alt="Califica"
          width={180}
          height={60}
          className="h-12 w-auto"
          priority
        />
      </div>
    </div>
  )
}
