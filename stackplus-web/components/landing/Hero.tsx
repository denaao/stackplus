import Image from 'next/image'
import Link from 'next/link'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 420px at 85% -10%, rgba(0,200,224,0.18), transparent 60%), radial-gradient(800px 360px at -10% 10%, rgba(0,200,224,0.10), transparent 55%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-10 pb-16 sm:pt-14 sm:pb-24">
        <nav className="flex items-center justify-between">
          <div className="flex flex-col items-start leading-none gap-1">
            <span
              className="text-3xl font-black tracking-tight text-sx-cyan sm:text-4xl"
              style={{ textShadow: '0 0 20px rgba(0,200,224,0.75)' }}
            >
              STACK+
            </span>
            <Image
              src="/sx-poker-logo.png"
              alt="SX Poker"
              width={72}
              height={16}
              className="object-contain"
              style={{ opacity: 0.75 }}
              priority
            />
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden text-sm text-zinc-300 hover:text-white sm:inline"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-sx-cyan px-4 py-2 text-sm font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
            >
              Criar home game
            </Link>
          </div>
        </nav>

        <div className="mt-14 grid items-center gap-12 sm:mt-20 lg:grid-cols-2">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Organize seu home game como um{' '}
              <span className="text-sx-cyan">profissional</span> — sem
              planilha, sem confusão.
            </h1>

            <p className="mt-5 max-w-xl text-lg text-zinc-300">
              O StackPlus controla fichas, caixa e jogadores enquanto você só
              joga.
            </p>

            <div className="mt-8">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-sx-cyan px-7 py-4 text-lg font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
              >
                Criar meu home game grátis
              </Link>
            </div>

            <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-300">
              <li className="flex items-center gap-2">
                <Check /> 1 minuto
              </li>
              <li className="flex items-center gap-2">
                <Check /> Sem cartão
              </li>
              <li className="flex items-center gap-2">
                <Check /> Funciona no celular
              </li>
            </ul>
          </div>

          {/* Snapshot mobile — tela de comandas */}
          <div className="relative mx-auto w-full max-w-xs sm:max-w-sm">
            <div className="relative overflow-hidden rounded-[2rem] border-[8px] border-zinc-900 bg-sx-card shadow-sx-glow-lg">
              <Image
                src="/comandas.jpg"
                alt="StackPlus no celular — controle de comandas"
                width={900}
                height={1800}
                className="h-auto w-full"
                priority
              />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-8 -z-10 rounded-3xl bg-sx-cyan/15 blur-3xl"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function Check() {
  return (
    <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-sx-cyan/15 text-xs text-sx-cyan">
      ✓
    </span>
  )
}
