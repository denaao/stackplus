'use client'

import { useRouter } from 'next/navigation'
import { useHomeGameRole } from '@/hooks/useHomeGameRole'

type TabKey = 'TOURNAMENTS' | 'CASH' | 'COMANDAS'

interface HomeGameTabsProps {
  homeGameId: string
  active: TabKey
}

/**
 * Barra de navegação rápida entre as 3 áreas do home game.
 * Fica grudada na parte inferior do AppHeader.
 */
export default function HomeGameTabs({ homeGameId, active }: HomeGameTabsProps) {
  const router = useRouter()
  const { canManage } = useHomeGameRole(homeGameId)

  const tabs: Array<{ key: TabKey; label: string; icon: string; onClick: () => void }> = [
    {
      key: 'TOURNAMENTS',
      label: 'Torneios',
      icon: '🏆',
      onClick: () => router.push(`/homegame/${homeGameId}/tournaments`),
    },
    {
      key: 'CASH',
      label: 'Cash',
      icon: '💵',
      onClick: () => router.push(`/homegame/${homeGameId}`),
    },
    ...(canManage
      ? [
          {
            key: 'COMANDAS' as TabKey,
            label: 'Comandas',
            icon: '💲',
            onClick: () => router.push(`/comanda?homeGameId=${homeGameId}`),
          },
        ]
      : []),
  ]

  return (
    <div
      className="sticky top-0 z-30"
      style={{
        background: 'linear-gradient(180deg, rgba(7,24,40,0.97) 0%, rgba(5,13,21,0.92) 100%)',
        borderBottom: '1px solid rgba(0,200,224,0.15)',
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
                  ? 'text-sx-cyan border-sx-cyan bg-sx-cyan/5'
                  : 'text-sx-muted border-transparent hover:text-white hover:bg-white/[0.03]'
              }`}
              style={isActive ? { boxShadow: 'inset 0 -1px 0 rgba(0,200,224,0.4)' } : undefined}
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
