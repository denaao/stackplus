const STEPS = [
  {
    n: '01',
    title: 'Crie sua mesa em 2 minutos',
    body: 'Escolhe cash game ou torneio, define buy-in, blinds e premiação. Pronto.',
  },
  {
    n: '02',
    title: 'Convide sua galera por link',
    body: 'Manda o link no grupo. Cada jogador entra pelo celular, sem baixar app, sem cadastro chato.',
  },
  {
    n: '03',
    title: 'Jogue com tudo no controle',
    body: 'Stack, blinds, premiação e acerto final — tudo automático. A TV mostra o placar, você joga tranquilo.',
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" className="relative">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            Como funciona
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Três passos. Você está jogando em 5 minutos.
          </h2>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-3">
          {STEPS.map((s, idx) => (
            <div key={s.n} className="relative">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-sx-cyan/40 bg-sx-card font-mono text-lg font-bold text-sx-cyan shadow-sx-glow-sm">
                  {s.n}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    aria-hidden
                    className="hidden h-px flex-1 bg-gradient-to-r from-sx-cyan/40 to-transparent lg:block"
                  />
                )}
              </div>
              <h3 className="mt-5 text-xl font-semibold text-white">
                {s.title}
              </h3>
              <p className="mt-2 text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
