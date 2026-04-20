export function ScreenInUse() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(800px 360px at 50% 50%, rgba(0,200,224,0.12), transparent 60%)',
        }}
      />
      <div className="relative mx-auto max-w-5xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            Na mão, durante o jogo
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            É isso que você usa na hora.
          </h2>
        </div>

        {/* Mockup: celular na horizontal com o app aberto, emulando estar em cima da mesa */}
        <div className="mt-14 flex justify-center">
          <div className="relative w-full max-w-md">
            {/* Moldura do celular */}
            <div className="relative mx-auto rounded-[2.2rem] border-[10px] border-zinc-900 bg-sx-bg shadow-[0_30px_80px_rgba(0,200,224,0.25)]">
              <div className="relative overflow-hidden rounded-[1.4rem] border border-sx-border bg-sx-card">
                {/* Status bar simulada */}
                <div className="flex items-center justify-between px-5 py-2 text-[10px] text-zinc-400">
                  <span>22:47</span>
                  <span className="font-mono">●●●● 4G</span>
                </div>

                {/* Conteúdo do app */}
                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col leading-none">
                      <span
                        className="text-xl font-black tracking-tight text-sx-cyan"
                        style={{
                          textShadow: '0 0 12px rgba(0,200,224,0.6)',
                        }}
                      >
                        STACK+
                      </span>
                      <span className="mt-1 text-[9px] uppercase tracking-widest text-sx-muted">
                        Torneio da galera
                      </span>
                    </div>
                    <span className="rounded bg-sx-cyan/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sx-cyan">
                      ao vivo
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-sx-border bg-sx-card2/70 p-3">
                      <div className="text-[9px] uppercase tracking-widest text-sx-muted">
                        Caixa
                      </div>
                      <div className="mt-1 text-lg font-bold text-sx-cyan">
                        R$ 1.800
                      </div>
                    </div>
                    <div className="rounded-lg border border-sx-border bg-sx-card2/70 p-3 shadow-sx-glow-sm">
                      <div className="text-[9px] uppercase tracking-widest text-sx-muted">
                        Na mesa
                      </div>
                      <div className="mt-1 text-lg font-bold text-zinc-100">
                        9 jogadores
                      </div>
                    </div>
                  </div>

                  <button className="w-full rounded-lg bg-sx-cyan py-3 text-sm font-semibold text-sx-bg shadow-sx-glow-btn">
                    + Vender fichas
                  </button>

                  <div className="rounded-lg border border-sx-border bg-sx-card2/70 p-3">
                    <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-sx-muted">
                      <span>Últimos</span>
                      <span>Hoje</span>
                    </div>
                    {[
                      ['Ana', 'Rebuy', 'R$ 100'],
                      ['Bruno', 'Buy-in', 'R$ 200'],
                      ['Diego', 'Rebuy', 'R$ 100'],
                    ].map(([name, type, amount], i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between border-b border-sx-border/60 py-1.5 text-xs last:border-0"
                      >
                        <span className="text-zinc-200">{name}</span>
                        <span className="text-sx-muted">{type}</span>
                        <span className="font-mono text-zinc-300">
                          {amount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sombra de mesa verde embaixo */}
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 left-1/2 h-20 w-[120%] -translate-x-1/2 rounded-full bg-emerald-950/60 blur-2xl"
            />
          </div>
        </div>

        <p className="mt-16 text-center text-sm text-sx-muted">
          Substituir por foto real do celular em cima da mesa de poker
        </p>
      </div>
    </section>
  )
}
