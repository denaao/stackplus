import Image from 'next/image'
import Link from 'next/link'

const STEPS = [
  { n: '1', title: 'Criar jogo', body: 'Nome da mesa, buy-in, blinds. Pronto.' },
  { n: '2', title: 'Abrir mesa', body: 'Jogadores entram pelo link. Sem cadastro chato.' },
  { n: '3', title: 'Vender fichas', body: 'Registra buy-in, rebuy, add-on em segundos.' },
  { n: '4', title: 'Fechar', body: 'Sistema mostra exatamente quem paga quem.' },
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
            Em menos de 2 minutos seu jogo está rodando.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, idx) => (
            <div key={s.n} className="relative">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-sx-cyan/40 bg-sx-card font-mono text-lg font-bold text-sx-cyan shadow-sx-glow-sm">
                  {s.n}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    aria-hidden
                    className="hidden h-px flex-1 bg-gradient-to-r from-sx-cyan/40 to-transparent lg:block"
                  />
                )}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {s.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>

        {/* Print real: tela de configuração de nova partida */}
        <div className="mt-14 grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
              Passo 1 na prática
            </span>
            <h3 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
              Configurar o jogo em 3 escolhas.
            </h3>
            <p className="mt-4 text-base text-zinc-400">
              Módulo financeiro, sangeur e jackpot em uma única tela. Sem
              formulário infinito, sem menu escondido. O que você precisa pra
              abrir a mesa, num clique cada.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-zinc-300">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-sx-cyan">▸</span>
                <span>
                  <strong className="text-white">Pós-pago, pré-pago ou híbrido</strong> — combina com qualquer galera.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-sx-cyan">▸</span>
                <span>
                  <strong className="text-white">Sangeur opcional</strong> — ative só quando tiver caixa móvel.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-sx-cyan">▸</span>
                <span>
                  <strong className="text-white">Jackpot integrado</strong> — pra quando a mesa quer apimentar.
                </span>
              </li>
            </ul>
          </div>

          <div className="order-1 mx-auto w-full max-w-md lg:order-2">
            <div className="relative overflow-hidden rounded-2xl border border-sx-border2 bg-sx-card shadow-sx-glow-lg">
              <Image
                src="/screen-new-match.png"
                alt="Tela de configuração de nova partida no StackPlus"
                width={620}
                height={820}
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-lg bg-sx-cyan px-6 py-3 text-base font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
          >
            Testar no meu próximo jogo
          </Link>
        </div>
      </div>
    </section>
  )
}
