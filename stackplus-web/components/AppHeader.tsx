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
    <header
      className="px-3 sm:px-5 py-0"
      style={{
        background: 'linear-gradient(180deg, rgba(7,24,40,0.99) 0%, rgba(5,13,21,0.97) 100%)',
        borderBottom: '1px solid rgba(0,200,224,0.2)',
        boxShadow: '0 2px 24px rgba(0,200,224,0.1)',
        minHeight: '64px',
      }}
    >
      <div className="max-w-5xl mx-auto min-h-16 flex items-center gap-2 sm:gap-4 py-2">

        {/* Back button */}
        {onBack && (
          <button onClick={onBack} className="text-sx-muted hover:text-sx-cyan transition-colors shrink-0 text-xl leading-none px-1">
            ←
          </button>
        )}

        {/* Logo + branding — compacto no mobile */}
        <div className="flex flex-col items-start leading-none shrink-0 gap-0.5 sm:gap-1">
          <span
            className="text-xl sm:text-3xl font-black text-sx-cyan tracking-tight"
            style={{ textShadow: '0 0 20px rgba(0,200,224,0.75)' }}
          >
            STACK+
          </span>
          <Image
            src="/sx-poker-logo.png"
            alt="SX Poker"
            width={54}
            height={12}
            className="object-contain hidden sm:block"
            style={{ opacity: 0.75 }}
            priority
          />
        </div>

        {/* Separator + Title */}
        {title && (
          <div className="flex-1 min-w-0 pl-2 sm:pl-4 sm:border-l sm:border-sx-border">
            <h1 className="font-bold text-sm sm:text-base text-white truncate">{title}</h1>
          </div>
        )}

        {!title && <div className="flex-1" />}

        {/* Right slot */}
        {rightSlot}

        {/* User nav */}
        {(userName || onLogout) && (
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {userName && (
              <span className="text-sm text-sx-muted hidden md:block truncate max-w-[160px]">{userName}</span>
            )}
            {onProfile && (
              <button onClick={onProfile} className="text-xs sm:text-sm text-sx-muted hover:text-sx-cyan transition-colors">
                Perfil
              </button>
            )}
            {onLogout && (
              <button onClick={onLogout} className="text-xs sm:text-sm text-sx-muted hover:text-red-400 transition-colors">
                Sair
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
