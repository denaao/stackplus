'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

interface AppHeaderProps {
  title?: string
  onBack?: () => void
  rightSlot?: React.ReactNode
  userName?: string
  onLogout?: () => void
  onProfile?: () => void
}

export default function AppHeader({
  title,
  onBack,
  rightSlot,
  userName,
  onLogout,
  onProfile,
}: AppHeaderProps) {
  const router = useRouter()

  return (
    <header className="bg-sx-card border-b border-sx-border px-4 py-3">
      <div className="max-w-5xl mx-auto flex items-center gap-3">

        {/* Back button */}
        {onBack && (
          <button onClick={onBack} className="text-sx-muted hover:text-white transition-colors shrink-0">
            ←
          </button>
        )}

        {/* Logo + branding */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Image
            src="/sx-poker-logo.png"
            alt="SX Poker"
            width={90}
            height={22}
            className="object-contain"
            priority
          />
          <div className="flex flex-col leading-none">
            <span className="text-[10px] text-sx-muted uppercase tracking-[0.15em] font-medium">powered by</span>
            <span className="text-sm font-black text-sx-cyan tracking-wider">STACK+</span>
          </div>
        </div>

        {/* Title */}
        {title && (
          <div className="flex-1 pl-2 border-l border-sx-border">
            <h1 className="font-bold text-base text-white truncate">{title}</h1>
          </div>
        )}

        {!title && <div className="flex-1" />}

        {/* Right slot (custom buttons) */}
        {rightSlot}

        {/* User nav */}
        {(userName || onLogout) && (
          <div className="flex items-center gap-3 shrink-0">
            {userName && <span className="text-sm text-sx-muted hidden sm:block">{userName}</span>}
            {onProfile && (
              <button onClick={onProfile} className="text-sm text-sx-muted hover:text-sx-cyan transition-colors">
                Perfil
              </button>
            )}
            {onLogout && (
              <button onClick={onLogout} className="text-sm text-sx-muted hover:text-red-400 transition-colors">
                Sair
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
