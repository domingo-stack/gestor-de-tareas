'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import Notifications from '@/components/Notifications'
import { useState, useEffect } from 'react'

export default function Navbar() {
  const { user, supabase, isLoading } = useAuth()
  const [role, setRole] = useState<string | null>(null);
  const router = useRouter()
  // El estado de teamName no se usa en el JSX, pero mantenemos la lógica por si acaso.
  const [teamName, setTeamName] = useState<string | null>(null);


  useEffect(() => {
    if (user && supabase) {
      const getNavbarData = async () => {
        const { data, error } = await supabase.rpc('get_user_role_and_team_info');

        if (error) {
          console.error("Error fetching navbar data:", error);
        } else if (data && data.length > 0) {
          setRole(data[0].role);
          setTeamName(data[0].team_name);
        }
      };
      getNavbarData();
    } else {
      setRole(null);
      setTeamName(null);
    }
  }, [user, supabase]);

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
                <Link
                href="/calendar"
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
                Ir a Kali-Calendario
            </Link>
                {role === 'Dueño' && (
                  <Link
                    href="/settings/team"
                    className="px-3 py-2 text-sm font-medium rounded-md"
                    // 👇 Color Naranja Hardcodeado
                    style={{ backgroundColor: '#ff8080', color: 'white' }}
                  >
                    Invitar
                  </Link>
                )}
                <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm font-medium rounded-md"
                   // 👇 Color Azul Hardcodeado
                  style={{ backgroundColor: '#3c527a', color: 'white' }}
                >
                  Cerrar Sesión
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  // Estilo de borde con color secundario
                  className="px-3 py-2 text-sm font-medium text-secondary border border-secondary rounded-md hover:bg-secondary hover:text-white"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  // Color primario (naranja) aplicado
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