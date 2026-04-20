const OBJECTIONS: Array<{ q: string; a: string }> = [
  {
    q: 'Meu jogo é simples',
    a: 'É aí que a conta se perde. Quanto menos estrutura, mais espaço pra esquecer um rebuy, uma ficha, um pix pendente. StackPlus organiza inclusive o jogo mais informal.',
  },
  {
    q: 'Eu já uso planilha',
    a: 'Isso substitui 100% e melhor — sem fórmula quebrada, sem coluna errada, sem ter que lembrar de salvar. Todo mundo vê o mesmo dado em tempo real.',
  },
  {
    q: 'Vai dar trabalho usar?',
    a: 'Leva menos de 2 minutos pra criar a primeira mesa. Interface desenhada pra você usar no celular durante o jogo — zero curva de aprendizado.',
  },
]

export function Objections() {
  return (
    <section className="relative border-y border-sx-border2 bg-sx-card/30">
      <div className="mx-auto max-w-4xl px-6 py-24">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            Antes que você pense
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            &quot;Ah, mas...&quot;.
          </h2>
        </div>

        <div className="mt-12 space-y-4">
          {OBJECTIONS.map((o) => (
            <div
              key={o.q}
              className="rounded-xl border border-sx-border bg-sx-card p-6"
            >
              <div className="flex items-start gap-4">
                <span className="mt-1 text-2xl" aria-hidden>
                  💬
                </span>
                <div>
                  <p className="text-lg font-semibold text-white">&quot;{o.q}&quot;</p>
                  <p className="mt-2 flex items-start gap-2 text-base text-zinc-300">
                    <span className="flex-none font-bold text-sx-cyan">→</span>
                    <span>{o.a}</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
 