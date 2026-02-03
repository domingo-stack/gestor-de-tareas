// app/layout.tsx

import './globals.css'
import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import { AuthProvider } from '@/context/AuthContext' // <-- 1. IMPORTA EL PROVIDER
import Navbar from '@/components/Navbar' // Asumiendo que el Navbar está aquí

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '700'] // 400 para normal, 700 para negrita
})

export const metadata: Metadata = {
  title: 'Gestor de Tareas',
  description: 'Una aplicación para gestionar tus proyectos y tareas.',
  icons: {
    icon: '/icon.png', // <--- Pon aquí el nombre EXACTO de tu archivo en public
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
        <AuthProvider> {/* <-- 2. ENVUELVE TODO CON EL PROVIDER */}
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}