// app/layout.tsx

import './globals.css'
import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import { AuthProvider } from '@/context/AuthContext'
import { PermissionsProvider } from '@/context/PermissionsContext'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '700'] // 400 para normal, 700 para negrita
})

export const metadata: Metadata = {
  title: 'Gestor de Tareas',
  description: 'Una aplicación para gestionar tus proyectos y tareas.',
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={nunito.className} suppressHydrationWarning={true}>
        <AuthProvider>
          <PermissionsProvider>
            <div className="flex h-screen">
              <Sidebar />
              <div className="flex-1 flex flex-col overflow-hidden">
                <TopBar />
                <main className="flex-1 overflow-y-auto">
                  {children}
                </main>
              </div>
            </div>
          </PermissionsProvider>
        </AuthProvider>
      </body>
    </html>
  )
}