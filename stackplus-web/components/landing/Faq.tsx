const FAQ = [
  {
    q: 'Preciso baixar alguma coisa?',
    a: 'Não. StackPlus roda no navegador, em qualquer dispositivo. Organizador no notebook, jogadores no celular, TV num Chromecast ou Smart TV. Nada pra instalar.',
  },
  {
    q: 'Quantos jogadores posso ter por mesa?',
    a: 'Sem limite. Já rodamos torneios com mais de 30 jogadores em múltiplas mesas. O sistema aguenta.',
  },
  {
    q: 'Precisa de internet durante o jogo?',
    a: 'Sim, para sincronizar em tempo real entre TV, organizador e jogadores. Um 4G básico no celular do host já resolve.',
  },
  {
    q: 'Meus dados e dos jogadores estão seguros?',
    a: 'Sim. Dados armazenados em infraestrutura com criptografia em repouso e em trânsito. Não vendemos dados pra terceiros.',
  },
  {
    q: 'Serve pra cash game ou só torneio?',
    a: 'Os dois. Você escolhe o formato na hora de criar a mesa. Cash game tem controle de banca, rebuys e acerto final. Torneio tem estrutura de blinds, timer, premiação por posição.',
  },
  {
    q: 'E quando o beta acabar?',
    a: 'Quem entrou no beta mantém condição especial de preço quando lançarmos os planos pagos. A gente avisa com antecedência.',
  },
]

export function Faq() {
  return (
    <section id="faq" className="relative border-y border-sx-border2 bg-sx-card/30">
      <div className="mx-auto max-w-4xl px-6 py-24">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            FAQ
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Perguntas que você provavelmente está fazendo.
          </h2>
        </div>

        <div className="mt-12 divide-y divide-sx-border2">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group py-5 [&>summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span className="text-base font-semibold text-white sm:text-lg">
                  {item.q}
                </span>
                <span
                  aria-hidden
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-sx-border2 text-sx-cyan transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 sm:text-base">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
