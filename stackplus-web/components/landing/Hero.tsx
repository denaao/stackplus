import Image from 'next/image'
import Link from 'next/link'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Glow backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 420px at 85% -10%, rgba(0,200,224,0.18), transparent 60%), radial-gradient(800px 360px at -10% 10%, rgba(0,200,224,0.10), transparent 55%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pt-10 pb-16 sm:pt-14 sm:pb-24">
        {/* Top bar */}
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

        {/* Hero content */}
        <div className="mt-14 grid items-center gap-12 sm:mt-20 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-sx-border2 bg-sx-card/60 px-3 py-1 text-xs font-medium text-sx-cyan">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sx-cyan" />
              Beta aberto — acesso gratuito
            </span>

            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Seu home game,{' '}
              <span className="text-sx-cyan">sem planilha</span> e{' '}
              <span className="text-sx-cyan">sem confusão</span>.
            </h1>

            <p className="mt-5 max-w-xl text-lg text-zinc-300">
              Controle fichas, torneios e premiação em tempo real. Tudo o que
              você faz hoje no papel e no grupo do WhatsApp, o StackPlus faz
              automático — na TV, no celular e no caixa.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-lg bg-sx-cyan px-6 py-3 text-base font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
              >
                Crie seu home game grátis
              </Link>
              <a
                href="#como-funciona"
                className="inline-flex items-center justify-center rounded-lg border border-sx-border2 bg-sx-card/60 px-6 py-3 text-base font-semibold text-zinc-200 transition hover:border-sx-cyan hover:text-white"
              >
                Ver como funciona
              </a>
            </div>

            <p className="mt-4 text-xs text-sx-muted">
              Sem cartão de crédito. Cancele quando quiser. Leva 2 minutos pra
              montar a primeira mesa.
            </p>
          </div>

          {/* Mockup do /tv */}
          <div className="relative">
            <div className="relative rounded-2xl border border-sx-border2 bg-sx-card p-4 shadow-sx-glow-lg">
              <div className="flex items-center gap-2 border-b border-sx-border pb-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-3 text-xs text-sx-muted">
                  stackplus.app/tv
                </span>
              </div>

              {/* TV mockup */}
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-sx-muted">
                      Torneio
                    </div>
                    <div className="text-xl font-bold">
                      Torneio da galera
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-widest text-sx-muted">
                      Blind atual
                    </div>
                    <div className="text-xl font-bold text-sx-cyan">
                      500 / 1.000
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <MockStat label="Jogadores" value="9 / 12" />
                  <MockStat label="Prêmio" value="R$ 1.800" />
                  <MockStat label="Próximo blind" value="07:42" glow />
                </div>

                <div className="rounded-lg border border-sx-border bg-sx-card2/70 p-3">
                  <div className="mb-2 text-xs uppercase tracking-widest text-sx-muted">
                    Ranking ao vivo
                  </div>
                  {[
                    ['1', 'Ana', '48.500'],
                    ['2', 'Bruno', '32.100'],
                    ['3', 'Camila', '26.800'],
                    ['4', 'Diego', '19.200'],
                  ].map(([pos, name, stack]) => (
                    <div
                      key={pos}
                      className="flex items-center justify-between border-b border-sx-border/60 py-1.5 text-sm last:border-0"
                    >
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-sx-border bg-sx-bg text-xs font-bold text-sx-cyan">
                          {pos}
                        </span>
                        <span className="text-zinc-100">{name}</span>
                      </span>
                      <span className="font-mono text-zinc-300">{stack}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              aria-hidden
              className="pointer-events-none absolute -inset-8 -z-10 rounded-3xl bg-sx-cyan/10 blur-3xl"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function MockStat({
  label,
  value,
  glow,
}: {
  label: string
  value: string
  glow?: boolean
}) {
  return (
    <div
      className={`rounded-lg border border-sx-border bg-sx-card2/70 p-3 ${
        glow ? 'shadow-sx-glow-sm' : ''
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-sx-muted">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-bold ${
          glow ? 'text-sx-cyan' : 'text-zinc-100'
        }`}
      >
        {value}
      </div>
    </div>
  )
}
