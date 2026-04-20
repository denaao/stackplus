import Image from 'next/image'

export function Footer() {
  return (
    <footer className="border-t border-sx-border2 bg-sx-bg">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-6 py-12 sm:flex-row sm:items-center">
        <div className="flex flex-col items-start leading-none gap-1">
          <span
            className="text-2xl font-black tracking-tight text-sx-cyan"
            style={{ textShadow: '0 0 18px rgba(0,200,224,0.65)' }}
          >
            STACK+
          </span>
          <Image
            src="/sx-poker-logo.png"
            alt="SX Poker"
            width={64}
            height={14}
            className="object-contain"
            style={{ opacity: 0.75 }}
          />
        </div>

        <div className="text-xs text-sx-muted sm:text-right">
          © {new Date().getFullYear()} StackPlus. Feito pra quem leva
          <br className="hidden sm:inline" /> o home game a sério.
        </div>
      </div>
    </footer>
  )
}
