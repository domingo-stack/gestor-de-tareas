'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { usePermissions } from '@/context/PermissionsContext'
import { useRouter } from 'next/navigation'
import Notifications from '@/components/Notifications'

export default function Navbar() {
  const { user, supabase } = useAuth()
  const { role, mod_calendario, mod_finanzas, mod_revenue } = usePermissions()
  const router = useRouter()

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      router.push('/login')
    } else {
      console.error('Error al cerrar sesión:', error)
    }
  }

  return (
    <nav className="bg-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0">
            <Link href="/" className="text-xl font-bold text-gray-800">
              Gestor de Tareas
            </Link>
          </div>
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <Notifications />
                {mod_calendario && (
                  <Link
                    href="/calendar"
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Ir a Kali-Calendario
                  </Link>
                )}

                {mod_finanzas && (
                  <Link
                    href="/finance"
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 flex items-center gap-2"
                  >
                    <span>Kali-Finanzas</span>
                  </Link>
                )}
                {mod_revenue && (
                  <Link
                    href="/revenue"
                    className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 flex items-center gap-2"
                  >
                    <span>Revenue</span>
                  </Link>
                )}

                {role === 'superadmin' && (
                  <>
                    <Link
                      href="/admin/users"
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                    >
                      Admin
                    </Link>
                    <Link
                      href="/settings/team"
                      className="px-3 py-2 text-sm font-medium rounded-md"
                      style={{ backgroundColor: '#ff8080', color: 'white' }}
                    >
                      Invitar
                    </Link>
                  </>
                )}

                <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm font-medium rounded-md"
                  style={{ backgroundColor: '#3c527a', color: 'white' }}
                >
                  Cerrar Sesión
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-3 py-2 text-sm font-medium text-secondary border border-secondary rounded-md hover:bg-secondary hover:text-white"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:opacity-90"
                >
                  Registrarse
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
