import Link from 'next/link'

const FEATURES = [
  'Mesas ilimitadas',
  'Jogadores ilimitados por mesa',
  'Torneios e cash game',
  'Modo TV',
  'Caixa e acerto automático',
  'Histórico e ranking',
  'Suporte por WhatsApp',
]

export function Pricing() {
  return (
    <section id="precos" className="relative">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            Preço
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Enquanto está no beta, é de graça.
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Sem pegadinha, sem cartão, sem limite de mesas. Quem entra agora
            mantém condição especial quando o preço final for lançado.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-lg">
          <div className="relative rounded-2xl border border-sx-cyan/40 bg-sx-card p-8 shadow-sx-glow-lg">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-sx-cyan px-3 py-1 text-xs font-semibold text-sx-bg">
              BETA ABERTO
            </div>

            <div className="text-center">
              <div className="text-sm uppercase tracking-widest text-sx-muted">
                Plano beta
              </div>
              <div className="mt-2 flex items-baseline justify-center gap-2">
                <span className="text-5xl font-bold text-white">R$ 0</span>
                <span className="text-zinc-400">/ mês</span>
              </div>
              <div className="mt-1 text-sm text-sx-muted">
                durante o período de beta
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-zinc-200">
                  <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-sx-cyan/15 text-sx-cyan">
                    ✓
                  </span>
                  <span className="text-sm">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/register"
              className="mt-8 block rounded-lg bg-sx-cyan py-3 text-center text-base font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
            >
              Entrar no beta grátis
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
