const FEATURES = [
  {
    icon: '📺',
    title: 'TV ao vivo',
    body:
      'Abre em qualquer tela (TV, notebook, tablet) e mostra ranking, blinds, premiação e timer. A mesa toda olha pra um lugar só.',
  },
  {
    icon: '💰',
    title: 'Caixa automatizada',
    body:
      'Entrada, saída, rebuys e add-ons registrados na hora. O acerto final sai com um clique — sem cálculo mental, sem treta.',
  },
  {
    icon: '🏆',
    title: 'Torneio estruturado',
    body:
      'Estrutura de blinds, intervalos, premiação por posição e timer automático. Do freezeout ao rebuy, você escolhe.',
  },
  {
    icon: '📱',
    title: 'App do jogador',
    body:
      'Cada jogador vê o próprio stack, o ranking e quanto falta pro próximo blind no celular. Zero fricção.',
  },
  {
    icon: '🎯',
    title: 'Cash game também',
    body:
      'Não é só torneio. Controla mesa de cash, calcula banca, registra sessões e gera histórico do seu grupo.',
  },
  {
    icon: '📊',
    title: 'Histórico e ranking',
    body:
      'Veja quem é o rei da sua liga ao longo das noites. Estatísticas por jogador, por torneio, por temporada.',
  },
]

export function Features() {
  return (
    <section className="relative border-y border-sx-border2 bg-sx-card/30">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            Funcionalidades
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Tudo que seu home game precisa. Nada que não precisa.
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Feito por quem organiza home game há tempo e cansou de gambiarra.
          </p>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-sx-border bg-sx-card p-6 transition hover:border-sx-cyan/60 hover:shadow-sx-glow-sm"
            >
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
