import Link from 'next/link'

const ROWS: Array<{ before: string; after: string }> = [
  { before: 'Bagunça', after: 'Organização' },
  { before: 'Conta errada', after: 'Fechamento automático' },
  { before: 'Você não joga', after: 'Você só joga' },
  { before: 'Discussão de valores', after: 'Tudo registrado' },
]

export function BeforeAfter() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            A transformação
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            O mesmo jogo, com o seu papel de volta.
          </h2>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-sx-border2">
          <div className="grid grid-cols-2 text-sm font-semibold uppercase tracking-widest">
            <div className="bg-sx-card/60 px-6 py-4 text-zinc-400">
              Antes
            </div>
            <div className="border-l border-sx-border2 bg-sx-cyan/10 px-6 py-4 text-sx-cyan">
              Depois com o StackPlus
            </div>
          </div>
          {ROWS.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-2 border-t border-sx-border2"
            >
              <div className="flex items-center gap-3 bg-sx-card/30 px-6 py-5 text-base text-zinc-400">
                <span className="text-zinc-600">✕</span>
                <span className="line-through decoration-zinc-700">
                  {r.before}
                </span>
              </div>
              <div className="flex items-center gap-3 border-l border-sx-border2 bg-sx-card/20 px-6 py-5 text-base text-zinc-100">
                <span className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-sx-cyan/20 text-xs text-sx-cyan">
                  ✓
                </span>
                <span>{r.after}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-lg bg-sx-cyan px-6 py-3 text-base font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
          >
            Quero meu jogo assim
          </Link>
        </div>
      </div>
    </section>
  )
}
