'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { usePermissions } from '@/context/PermissionsContext'
import {
  HomeIcon,
  FolderIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  ChartBarIcon,
  RocketLaunchIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

const STORAGE_KEY = 'sidebar-expanded'

export default function Sidebar() {
  const { user, supabase } = useAuth()
  const { role, mod_calendario, mod_finanzas, mod_revenue, mod_producto, mod_customer_success } = usePermissions()
  const router = useRouter()
  const pathname = usePathname()

  const [isExpanded, setIsExpanded] = useState(true)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Load persisted state
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setIsExpanded(stored === 'true')
  }, [])

  const toggleExpanded = () => {
    const next = !isExpanded
    setIsExpanded(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  // Close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) router.push('/login')
  }

  // Don't render sidebar on login/register pages
  if (!user) return null

  const navItems = [
    { href: '/', label: 'Dashboard', icon: HomeIcon, visible: true },
    { href: '/projects', label: 'Proyectos', icon: FolderIcon, visible: true },
    { href: '/calendar', label: 'Calendario', icon: CalendarDaysIcon, visible: role === 'superadmin' || !!mod_calendario },
    { href: '/finance', label: 'Finanzas', icon: BanknotesIcon, visible: role === 'superadmin' || !!mod_finanzas },
    { href: '/revenue', label: 'Revenue', icon: ChartBarIcon, visible: role === 'superadmin' || !!mod_revenue },
    { href: '/producto', label: 'Producto', icon: RocketLaunchIcon, visible: role === 'superadmin' || !!mod_producto },
    { href: '/customer-success', label: 'Customer Success', icon: ChatBubbleLeftRightIcon, visible: role === 'superadmin' || !!mod_customer_success },
  ]

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-gray-200 shrink-0">
        {isExpanded ? (
          <div className="flex items-center justify-between w-full">
            <Link href="/" className="min-w-0">
              <span className="text-sm font-bold truncate" style={{ color: '#383838' }}>
                Gestor de Tareas
              </span>
            </Link>
            <button
              onClick={toggleExpanded}
              className="p-1 rounded hover:bg-gray-100 hidden md:block shrink-0"
              title="Colapsar sidebar"
            >
              <Bars3Icon className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        ) : (
          <button
            onClick={toggleExpanded}
            className="mx-auto p-1 rounded hover:bg-gray-100 hidden md:block"
            title="Expandir sidebar"
          >
            <Bars3Icon className="h-5 w-5 text-gray-500" />
          </button>
        )}
        {/* Mobile close button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="p-1 rounded hover:bg-gray-100 md:hidden ml-auto"
        >
          <XMarkIcon className="h-5 w-5 text-gray-500" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navItems.filter(item => item.visible).map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                active
                  ? 'text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={active ? { backgroundColor: '#ff8080' } : undefined}
              title={!isExpanded ? item.label : undefined}
            >
              <item.icon className={`h-5 w-5 shrink-0 ${active ? 'text-white' : 'text-gray-500'}`} />
              {isExpanded && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 py-3 px-2 shrink-0">
        {/* Admin link */}
        {role === 'superadmin' && (
          <Link
            href="/admin/users"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${
              isActive('/admin')
                ? 'text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            style={isActive('/admin') ? { backgroundColor: '#ff8080' } : undefined}
            title={!isExpanded ? 'Admin' : undefined}
          >
            <Cog6ToothIcon className={`h-5 w-5 shrink-0 ${isActive('/admin') ? 'text-white' : 'text-gray-500'}`} />
            {isExpanded && <span className="text-sm font-medium">Admin</span>}
          </Link>
        )}

        {/* User email */}
        {isExpanded && (
          <div className="px-3 py-1.5 mb-1">
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-gray-600 hover:bg-gray-100 transition-colors"
          title={!isExpanded ? 'Cerrar Sesión' : undefined}
        >
          <ArrowRightStartOnRectangleIcon className="h-5 w-5 shrink-0 text-gray-500" />
          {isExpanded && <span className="text-sm font-medium">Cerrar Sesión</span>}
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed top-4 left-4 z-40 p-2 bg-white rounded-lg shadow-md md:hidden"
        aria-label="Abrir menú"
      >
        <Bars3Icon className="h-6 w-6 text-gray-700" />
      </button>

      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-white shadow-xl z-50 flex flex-col transition-transform duration-300 md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-white border-r border-gray-200 h-screen shrink-0 transition-[width] duration-300 ${
          isExpanded ? 'w-60' : 'w-16'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
