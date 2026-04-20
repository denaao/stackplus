import Link from 'next/link'

const PAINS = [
  'Conta não bate no final',
  'Jogador pergunta saldo o tempo todo',
  'Você vira o caixa da mesa',
  'Planilha confusa que só você entende',
  'Dinheiro, pix e ficha tudo misturado',
]

export function Pain() {
  return (
    <section className="relative border-y border-sx-border2 bg-sx-card/30">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="max-w-3xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Se você já organizou um poker entre amigos, isso aqui já
            aconteceu:
          </h2>
        </div>

        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {PAINS.map((p) => (
            <li
              key={p}
              className="flex items-start gap-3 rounded-lg border border-sx-border bg-sx-card px-5 py-4 text-zinc-200"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-sx-cyan/10 text-sm text-sx-cyan">
                ✓
              </span>
              <span className="text-base">{p}</span>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-center text-2xl font-bold text-white sm:text-3xl">
          Seu home game vira <span className="text-sx-cyan">trabalho</span>.
        </p>

        <div className="mt-8 text-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-lg bg-sx-cyan px-6 py-3 text-base font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
          >
            Nunca mais passar por isso
          </Link>
        </div>
      </div>
    </section>
  )
}
