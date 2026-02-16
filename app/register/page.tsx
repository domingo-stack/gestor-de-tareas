'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F8F8' }}>
        <p className="text-lg text-gray-500">Cargando...</p>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}

function RegisterContent() {
  const [email, setEmail] = useState('')
  const { supabase } = useAuth();
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [validatingToken, setValidatingToken] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)

  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite_token')

  useEffect(() => {
    async function validateToken() {
      if (!inviteToken) {
        setValidatingToken(false)
        return
      }

      const { data, error } = await supabase
        .from('invitations')
        .select('id, email, accepted')
        .eq('token', inviteToken)
        .single()

      if (error || !data) {
        setError('El enlace de invitación no es válido o ha expirado.')
        setValidatingToken(false)
        return
      }

      if (data.accepted) {
        setError('Esta invitación ya fue utilizada.')
        setValidatingToken(false)
        return
      }

      setEmail(data.email || '')
      setTokenValid(true)
      setValidatingToken(false)
    }

    validateToken()
  }, [inviteToken, supabase])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signUpError) {
      setError(signUpError.message)
    } else {
      // Marcar invitación como aceptada
      if (inviteToken) {
        await supabase
          .from('invitations')
          .update({ accepted: true })
          .eq('token', inviteToken)
      }
      setMessage('¡Registro exitoso! Por favor, revisa tu email para confirmar tu cuenta.')
    }
    setLoading(false)
  }

  if (validatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F8F8' }}>
        <p className="text-lg text-gray-500">Validando invitación...</p>
      </div>
    )
  }

  // Sin token de invitación → bloquear registro
  if (!inviteToken) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F8F8' }}>
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#383838' }}>
            Registro por Invitación
          </h2>
          <p className="text-gray-600 mb-4">
            Necesitas una invitación para registrarte en la plataforma.
          </p>
          <p className="text-gray-500 text-sm">
            Contacta al administrador de tu organización para obtener un enlace de invitación.
          </p>
        </div>
      </div>
    )
  }

  // Token inválido o ya usado
  if (!tokenValid && error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F8F8' }}>
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#383838' }}>
            Invitación Inválida
          </h2>
          <p className="text-sm" style={{ color: '#ff8080' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#F8F8F8' }}
    >
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <h2
          className="text-2xl font-bold text-center mb-6"
          style={{ color: '#383838' }}
        >
          Crear una Cuenta
        </h2>

        {message ? (
          <p className="text-center" style={{ color: '#3c527a' }}>{message}</p>
        ) : (
          <form onSubmit={handleRegister} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium"
                style={{ color: '#383838' }}
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium"
                style={{ color: '#383838' }}
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              />
            </div>

            {error && <p className="text-sm" style={{ color: '#ff8080' }}>{error}</p>}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white transition-colors"
                style={{
                  backgroundColor: loading ? '#FCA5A5' : '#ff8080',
                  cursor: loading ? 'not-allowed' : 'pointer'
                }}
              >
                {loading ? 'Registrando...' : 'Registrarse'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
