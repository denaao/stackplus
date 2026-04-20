const PAINS = [
  {
    title: 'Planilha no celular',
    body: 'Alguém anotando entrada e saída numa lista de notas. Caligrafia duvidosa, soma errada, discussão certa.',
  },
  {
    title: '"Quem tá ganhando?"',
    body: 'A cada mão tem alguém perguntando. Ninguém sabe ao certo. A mesa toda trava pra conferir as fichas.',
  },
  {
    title: 'Acerto final confuso',
    body: 'No fim da noite é R$ 40 pra um, R$ 120 pra outro, ninguém lembra direito. Alguém sai chateado.',
  },
]

export function Pain() {
  return (
    <section className="relative border-y border-sx-border2 bg-sx-card/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Você não quer mais passar por isso.
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Se você já organizou um home game, conhece essas três cenas. O
            StackPlus existe pra que elas nunca mais aconteçam na sua mesa.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {PAINS.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-sx-border bg-sx-card p-6 transition hover:border-sx-cyan/60"
            >
              <div className="text-lg font-semibold text-white">{p.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
