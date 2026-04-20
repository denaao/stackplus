import Link from 'next/link'

export function CtaFinal() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(800px 340px at 50% 0%, rgba(0,200,224,0.18), transparent 60%)',
        }}
      />
      <div className="relative mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
          Sua próxima mesa <span className="text-sx-cyan">merece</span>.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-300">
          Em 2 minutos você tem sua mesa no ar. Chama a galera e joga hoje
          mesmo.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-lg bg-sx-cyan px-7 py-3 text-base font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
          >
            Crie seu home game grátis
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-sx-border2 bg-sx-card/60 px-7 py-3 text-base font-semibold text-zinc-200 transition hover:border-sx-cyan hover:text-white"
          >
            Já tenho conta
          </Link>
        </div>
        <p className="mt-4 text-xs text-sx-muted">
          Sem cartão. Sem compromisso. Sem enrolação.
        </p>
      </div>
    </section>
  )
}
