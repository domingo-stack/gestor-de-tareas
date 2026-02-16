'use client'

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'

type PermissionsContextType = {
  role: string | null;
  mod_tareas: boolean;
  mod_calendario: boolean;
  mod_revenue: boolean;
  mod_finanzas: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user, supabase, isLoading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [mod_tareas, setModTareas] = useState(false);
  const [mod_calendario, setModCalendario] = useState(false);
  const [mod_revenue, setModRevenue] = useState(false);
  const [mod_finanzas, setModFinanzas] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    if (!user || !supabase) {
      setRole(null);
      setModTareas(false);
      setModCalendario(false);
      setModRevenue(false);
      setModFinanzas(false);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('get_user_role_and_permissions');

    if (error) {
      console.error('Error fetching permissions:', error);
      setIsLoading(false);
      return;
    }

    if (data && data.length > 0) {
      const p = data[0];
      setRole(p.role);
      setModTareas(p.mod_tareas);
      setModCalendario(p.mod_calendario);
      setModRevenue(p.mod_revenue);
      setModFinanzas(p.mod_finanzas);
    }

    setIsLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (!authLoading) {
      fetchPermissions();
    }
  }, [authLoading, fetchPermissions]);

  const value = useMemo(() => ({
    role,
    mod_tareas,
    mod_calendario,
    mod_revenue,
    mod_finanzas,
    isLoading: isLoading || authLoading,
    refetch: fetchPermissions,
  }), [role, mod_tareas, mod_calendario, mod_revenue, mod_finanzas, isLoading, authLoading, fetchPermissions]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
}
