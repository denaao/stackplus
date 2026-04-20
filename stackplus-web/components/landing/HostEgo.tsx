import Image from 'next/image'

export function HostEgo() {
  return (
    <section className="relative overflow-hidden border-y border-sx-border2 bg-sx-card/30">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(700px 300px at 100% 50%, rgba(0,200,224,0.14), transparent 60%)',
        }}
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-sx-cyan">
            Para o anfitrião
          </span>
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Vire o anfitrião que faz o{' '}
            <span className="text-sx-cyan">melhor poker da turma</span>.
          </h2>
          <p className="mt-5 max-w-xl text-lg text-zinc-300">
            Ligue uma TV, um notebook ou até um tablet e coloque o modo TV do
            StackPlus na mesa. Timer gigante, premiação ao vivo, quem tá
            dentro — seus amigos entram em casa e já sabem que a noite vai
            ser diferente.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['🏆', 'Reputação', 'A turma sabe que o seu poker é bem feito'],
              ['⚡', 'Fluidez', 'Menos tempo anotando, mais tempo jogando'],
              ['🤝', 'Confiança', 'Ninguém sai da mesa desconfiando da conta'],
            ].map(([icon, title, body]) => (
              <div
                key={title}
                className="rounded-xl border border-sx-border bg-sx-card p-4"
              >
                <div className="text-2xl">{icon}</div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {title}
                </div>
                <div className="mt-1 text-xs text-zinc-400">{body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Print real do modo TV — visual mais impactante do produto */}
        <div className="relative">
          <div className="relative overflow-hidden rounded-2xl border border-sx-border2 bg-sx-card shadow-sx-glow-lg">
            <Image
              src="/screen-tv-clock.png"
              alt="Modo TV do StackPlus — timer, premiação e status do torneio"
              width={1400}
              height={900}
              className="h-auto w-full"
            />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl bg-sx-cyan/10 blur-3xl"
          />
        </div>
      </div>
    </section>
  )
}
