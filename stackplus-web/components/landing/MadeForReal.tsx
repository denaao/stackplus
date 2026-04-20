const ITEMS: Array<{ icon: string; text: string }> = [
  { icon: '🎲', text: 'Rebuy e add-on ilimitados' },
  { icon: '🕐', text: 'Jogador chegando atrasado' },
  { icon: '💸', text: 'Pagamento em dinheiro, pix ou depois' },
  { icon: '🃏', text: 'Sangria de fichas' },
  { icon: '✅', text: 'Fechamento automático no final' },
]

export function MadeForReal() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            Feito pra realidade
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Criado para a rotina real do seu jogo.
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Nada de caso perfeito. O StackPlus foi pensado pra lidar com o
            que realmente acontece na sua mesa.
          </p>
        </div>

        <ul className="mt-12 grid gap-3 sm:grid-cols-2">
          {ITEMS.map((item) => (
            <li
              key={item.text}
              className="flex items-center gap-4 rounded-xl border border-sx-border bg-sx-card px-5 py-4 transition hover:border-sx-cyan/60"
            >
              <span className="text-2xl" aria-hidden>
                {item.icon}
              </span>
              <span className="text-base text-zinc-100">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
