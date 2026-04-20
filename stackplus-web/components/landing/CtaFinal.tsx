import Link from 'next/link'

export function CtaFinal() {
  return (
    <section className="relative overflow-hidden bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 400px at 50% 0%, rgba(0,200,224,0.22), transparent 60%)',
        }}
      />
      <div className="relative mx-auto max-w-4xl px-6 py-28 text-center">
        <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          No próximo home game,{' '}
          <span className="text-sx-cyan">jogue poker</span>.
          <br />
          Não seja o contador da mesa.
        </h2>

        <div className="mt-10">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-lg bg-sx-cyan px-10 py-5 text-xl font-semibold text-sx-bg shadow-sx-glow-btn transition hover:brightness-110"
          >
            Criar meu home game grátis
          </Link>
        </div>

        <p className="mt-5 text-sm text-sx-muted">
          Sem cartão • 1 minuto • Comece agora
        </p>
      </div>
    </section>
  )
}
