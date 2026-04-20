'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import AppLoading from '@/components/AppLoading'
import { useAuthStore } from '@/store/useStore'
import { useHomeGameRole } from '@/hooks/useHomeGameRole'

interface HomeGame {
  id: string
  name: string
  address: string
  dayOfWeek: string
  startTime: string
  chipValue: string
  gameType?: 'CASH_GAME' | 'TOURNAMENT'
  _count?: { members: number; sessions: number }
}

export default function HomeGameSelectPage() {
  const router = useRouter()
  const params = useParams()
  const { user, logout } = useAuthStore()
  const id = params.id as string
  const [game, setGame] = useState<HomeGame | null>(null)
  const [loading, setLoading] = useState(true)
  const { canManage } = useHomeGameRole(id)

  useEffect(() => {
    api.get(`/home-games/${id}`)
      .then(({ data }) => setGame(data))
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false))
  }, [id, router])

  function handleLogout() { logout(); router.push('/') }

  if (loading) return <AppLoading />

  if (!game) return null

  // "Comandas" só aparece para host/co-host/admin — jogador comum não lista comandas do HG.
  const actions = [
    { key: 'cash',       label: 'Cash Game', icon: '💵', onClick: () => router.push(`/homegame/${id}`) },
    { key: 'tournament', label: 'Torneio',   icon: '🏆', onClick: () => router.push(`/homegame/${id}/tournaments`) },
    ...(canManage
      ? [{ key: 'comanda', label: 'Comandas', icon: '💲', onClick: () => router.push(`/comanda?homeGameId=${id}`) }]
      : []),
    { key: 'members',    label: 'Membros',   icon: '👥', onClick: () => router.push(`/homegame/${id}/members`) },
  ]

  return (
    <div className="min-h-screen">
      <AppHeader
        onBack={() => router.push('/dashboard')}
        userName={user?.name}
        onLogout={handleLogout}
      />

      <main className="max-w-lg mx-auto px-4 py-10">

        {/* Game info */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black text-white mb-1">{game.name}</h1>
          <div className="flex items-center justify-center gap-3 text-sm text-sx-muted">
            <span>📍 {game.address}</span>
          </div>
        </div>

        {/* Action selection */}
        <p className="text-[11px] uppercase tracking-widest text-sx-muted text-center mb-5 font-bold">
          O que deseja iniciar?
        </p>

        <div className="space-y-3">
          {actions.map((action) => (
            <button
              key={action.key}
              onClick={action.onClick}
              className="w-full rounded-2xl p-5 text-left flex items-center gap-4 group transition-all"
              style={{
                background: 'rgba(7,24,40,0.7)',
                border: '1px solid rgba(0,200,224,0.2)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(0,200,224,0.5)'
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,200,224,0.06)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.border = '1px solid rgba(0,200,224,0.2)'
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(7,24,40,0.7)'
              }}
            >
              <span className="text-3xl">{action.icon}</span>
              <p className="font-bold text-white text-base">{action.label}</p>
              <span className="ml-auto text-sx-muted text-xl group-hover:text-sx-cyan group-hover:translate-x-1 transition-all">→</span>
            </button>
          ))}
        </div>

      </main>
    </div>
  )
}
