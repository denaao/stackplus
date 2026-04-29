'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import EventTabs from '@/components/EventTabs'
import { useAuthStore } from '@/store/useStore'

type StaffRole = 'TOURNAMENT_DIRECTOR' | 'CASH_DIRECTOR' | 'CASHIER' | 'SANGEUR' | 'DEALER'
type PermissionKey =
  | 'CREATE_TOURNAMENT'
  | 'MANAGE_TOURNAMENT'
  | 'MANAGE_CASH_GAME'
  | 'VIEW_COMANDAS'
  | 'DAILY_CLOSE'
  | 'POS_TOURNAMENT'
  | 'POS_CASH'
  | 'CAIXINHA'
  | 'PONTO'

interface MatrixRow {
  role: StaffRole
  permission: PermissionKey
  allowed: boolean
  isOverride: boolean
}

const ROLE_LABEL: Record<StaffRole, string> = {
  TOURNAMENT_DIRECTOR: 'Dir. Torneio',
  CASH_DIRECTOR: 'Dir. Cash',
  CASHIER: 'Caixa',
  SANGEUR: 'Sangeur',
  DEALER: 'Dealer',
}

const PERMISSION_LABEL: Record<PermissionKey, string> = {
  CREATE_TOURNAMENT: 'Criar torneio',
  MANAGE_TOURNAMENT: 'Gerir torneio',
  MANAGE_CASH_GAME: 'Gerir cash game',
  VIEW_COMANDAS: 'Comandas',
  DAILY_CLOSE: 'Fechamento diário',
  POS_TOURNAMENT: 'POS torneio',
  POS_CASH: 'POS cash',
  CAIXINHA: 'Caixinha',
  PONTO: 'Ponto',
}

const ROLES: StaffRole[] = ['TOURNAMENT_DIRECTOR', 'CASH_DIRECTOR', 'CASHIER', 'SANGEUR', 'DEALER']
const PERMISSIONS: PermissionKey[] = [
  'CREATE_TOURNAMENT', 'MANAGE_TOURNAMENT', 'MANAGE_CASH_GAME',
  'VIEW_COMANDAS', 'DAILY_CLOSE', 'POS_TOURNAMENT', 'POS_CASH',
  'CAIXINHA', 'PONTO',
]

// HOST always has full access — shown as locked column
const HOST_LOCKED: PermissionKey[] = PERMISSIONS

export default function EventPermissionsPage() {
  const { id: eventId } = useParams<{ id: string }>()
  const router = useRouter()
  const { user, logout } = useAuthStore()

  const [matrix, setMatrix] = useState<MatrixRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null) // `${role}:${permission}`
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    api.get(`/events/${eventId}/staff/permissions`)
      .then(r => setMatrix(r.data))
      .catch(e => setError(e?.response?.data?.error ?? 'Erro ao carregar permissões'))
      .finally(() => setLoading(false))
  }, [eventId])

  function getCell(role: StaffRole, permission: PermissionKey): MatrixRow | undefined {
    return matrix.find(r => r.role === role && r.permission === permission)
  }

  async function toggleCell(role: StaffRole, permission: PermissionKey) {
    const cell = getCell(role, permission)
    const currentAllowed = cell?.allowed ?? false
    const key = `${role}:${permission}`
    setSaving(key)
    try {
      await api.put(`/events/${eventId}/staff/permissions`, {
        role, permission, allowed: !currentAllowed,
      })
      setMatrix(prev => prev.map(r =>
        r.role === role && r.permission === permission
          ? { ...r, allowed: !currentAllowed, isOverride: true }
          : r
      ))
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Erro ao salvar')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      <AppHeader
        module="Eventos"
        title="Permissões"
        onBack={() => router.push(`/event/${eventId}`)}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />
      <EventTabs eventId={eventId} active="MESAS" canManage={true} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">

        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">Matriz de permissões</h2>
          <p className="text-sm text-sx-muted">
            Configure o que cada cargo pode fazer neste evento. HOST tem acesso total e não pode ser alterado.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-sx-amber border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{
            border: '1px solid rgba(245,158,11,0.15)',
            background: 'linear-gradient(135deg, #1C1000 0%, #0F0800 60%, #050300 100%)',
          }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(245,158,11,0.12)' }}>
                    <th className="text-left px-4 py-3 text-xs uppercase tracking-widest text-sx-muted font-medium w-44">
                      Ação
                    </th>
                    {/* HOST — locked */}
                    <th className="px-3 py-3 text-center">
                      <div className="text-xs font-bold text-sx-amber">HOST</div>
                      <div className="text-[10px] text-sx-muted">total</div>
                    </th>
                    {ROLES.map(role => (
                      <th key={role} className="px-3 py-3 text-center">
                        <div className="text-xs font-bold text-white">{ROLE_LABEL[role]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map((permission, pi) => (
                    <tr
                      key={permission}
                      style={{
                        borderBottom: pi < PERMISSIONS.length - 1
                          ? '1px solid rgba(255,255,255,0.04)'
                          : 'none',
                      }}
                    >
                      <td className="px-4 py-3 text-sm text-white/80">
                        {PERMISSION_LABEL[permission]}
                      </td>

                      {/* HOST — always locked on */}
                      <td className="px-3 py-3 text-center">
                        <CheckIcon locked />
                      </td>

                      {ROLES.map(role => {
                        const cell = getCell(role, permission)
                        const allowed = cell?.allowed ?? false
                        const isOverride = cell?.isOverride ?? false
                        const key = `${role}:${permission}`
                        const isSaving = saving === key
                        return (
                          <td key={role} className="px-3 py-3 text-center">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => toggleCell(role, permission)}
                              className="mx-auto flex items-center justify-center w-7 h-7 rounded-lg transition-all disabled:opacity-50"
                              style={{
                                background: allowed
                                  ? 'rgba(245,158,11,0.15)'
                                  : 'rgba(255,255,255,0.04)',
                                border: allowed
                                  ? '1px solid rgba(245,158,11,0.4)'
                                  : '1px solid rgba(255,255,255,0.1)',
                              }}
                              title={isOverride ? 'Personalizado (clique para alternar)' : 'Padrão (clique para alterar)'}
                            >
                              {isSaving ? (
                                <div className="w-3 h-3 border border-sx-amber border-t-transparent rounded-full animate-spin" />
                              ) : allowed ? (
                                <span className="text-sx-amber text-sm font-bold">✓</span>
                              ) : (
                                <span className="text-white/20 text-xs">—</span>
                              )}
                            </button>
                            {isOverride && (
                              <div className="w-1 h-1 rounded-full bg-sx-amber mx-auto mt-0.5" title="Personalizado" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legenda */}
            <div className="flex items-center gap-4 px-4 py-3 text-xs text-sx-muted"
              style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-1 h-1 rounded-full bg-sx-amber" />
                <span>Ponto laranja = valor personalizado para este evento</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>Sem ponto = valor padrão do sistema</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function CheckIcon({ locked = false }: { locked?: boolean }) {
  return (
    <div className="mx-auto flex items-center justify-center w-7 h-7 rounded-lg"
      style={{
        background: 'rgba(245,158,11,0.15)',
        border: '1px solid rgba(245,158,11,0.4)',
        opacity: locked ? 0.6 : 1,
      }}>
      <span className="text-sx-amber text-sm font-bold">✓</span>
    </div>
  )
}
