'use client'

import { useRouter } from 'next/navigation'

type TabKey = 'MESAS' | 'COMANDAS' | 'FECHAMENTO'

interface EventTabsProps {
  eventId: string
  active: TabKey
  canManage?: boolean
}

/**
 * Barra de navegação rápida entre as 3 áreas do evento.
 * Fica grudada na parte inferior do AppHeader.
 */
export default function EventTabs({ eventId, active, canManage = false }: EventTabsProps) {
  const router = useRouter()

  const tabs: Array<{ key: TabKey; label: string; icon: string; onClick: () => void }> = [
    {
      key: 'MESAS',
      label: 'Mesas & Torneios',
      icon: '🏆',
      onClick: () => router.push(`/event/${eventId}`),
    },
    ...(canManage
      ? [
          {
            key: 'COMANDAS' as TabKey,
            label: 'Comandas',
            icon: '💲',
            onClick: () => router.push(`/event/${eventId}/comandas`),
          },
          {
            key: 'FECHAMENTO' as TabKey,
            label: 'Fechamento',
            icon: '📅',
            onClick: () => router.push(`/event/${eventId}/daily-close`),
          },
        ]
      : []),
  ]

  return (
    <div
      className="sticky top-0 z-30"
      style={{
        background: 'linear-gradient(180deg, rgba(20,10,0,0.97) 0%, rgba(10,5,0,0.95) 100%)',
        borderBottom: '1px solid rgba(245,158,11,0.2)',
      }}
    >
      <div className="max-w-5xl mx-auto flex">
        {tabs.map((tab) => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              type="button"
              onClick={tab.onClick}
              className={`flex-1 flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5 sm:py-3 text-xs sm:text-sm font-bold transition-all border-b-2 ${
                isActive
                  ? 'text-sx-amber border-sx-amber bg-sx-amber/5'
                  : 'text-sx-muted border-transparent hover:text-white hover:bg-white/[0.03]'
              }`}
              style={isActive ? { boxShadow: 'inset 0 -1px 0 rgba(245,158,11,0.5)' } : undefined}
            >
              <span className="text-sm sm:text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
