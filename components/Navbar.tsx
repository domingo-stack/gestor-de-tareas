'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Notifications from '@/components/Notifications'
import { useState, useEffect } from 'react'

export default function Navbar() {
  const { user } = useAuth()
  const [role, setRole] = useState<string | null>(null);
  const router = useRouter()

  // --- LÓGICA PARA OBTENER EL ROL (REESCRITA Y A PRUEBA DE ERRORES) ---
  useEffect(() => {
    if (user) {
      const getUserRole = async () => {
        // Paso 1: Obtener el ID del equipo del usuario actual.
        const { data: memberData } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)
          .single();

        if (!memberData) {
          setRole(null); // El usuario no pertenece a ningún equipo
          return;
        }

        // Paso 2: Con el ID del equipo, obtener el ID del dueño de ese equipo.
        const { data: teamData } = await supabase
          .from('teams')
          .select('owner_id')
          .eq('id', memberData.team_id)
          .single();

        // Paso 3: Comparar si el usuario actual es el dueño del equipo.
        if (teamData && teamData.owner_id === user.id) {
          setRole('Dueño');
        } else {
          setRole('Miembro');
        }
      };
      getUserRole();
    } else {
      setRole(null); // Limpia el rol si no hay usuario
    }
  }, [user]); // Se ejecuta cada vez que el usuario cambia

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
                {role === 'Dueño' && (
                  <Link
                    href="/settings/team"
                    className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                  >
                    Invitar
                  </Link>
                )}
                <span className="text-sm text-gray-600 hidden sm:block">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Cerrar Sesión
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100">
                  Login
                </Link>
                <Link href="/register" className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
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