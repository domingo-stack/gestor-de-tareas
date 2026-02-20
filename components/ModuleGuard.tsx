'use client'

import { usePermissions } from '@/context/PermissionsContext'

type ModuleKey = 'mod_tareas' | 'mod_calendario' | 'mod_revenue' | 'mod_finanzas' | 'mod_producto';

interface ModuleGuardProps {
  module: ModuleKey;
  children: React.ReactNode;
}

export default function ModuleGuard({ module, children }: ModuleGuardProps) {
  const { role, isLoading, ...permissions } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <p className="text-lg text-gray-500">Cargando permisos...</p>
      </div>
    );
  }

  // Usuario sin rol (registrado sin invitación)
  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <h2 className="text-xl font-bold mb-3" style={{ color: '#383838' }}>
            Cuenta Pendiente de Aprobación
          </h2>
          <p className="text-gray-600">
            Tu cuenta está pendiente de aprobación por un administrador.
            Contacta al administrador de tu organización para obtener acceso.
          </p>
        </div>
      </div>
    );
  }

  // Superadmin siempre tiene acceso
  if (role === 'superadmin') {
    return <>{children}</>;
  }

  // Verificar permiso del módulo específico
  if (!permissions[module]) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
          <h2 className="text-xl font-bold mb-3" style={{ color: '#383838' }}>
            Acceso Denegado
          </h2>
          <p className="text-gray-600">
            No tienes permisos para acceder a este módulo.
            Contacta al administrador si necesitas acceso.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
