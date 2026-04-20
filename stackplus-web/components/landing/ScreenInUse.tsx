import Image from 'next/image'

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

        <div className="mt-14 flex justify-center">
          <div className="relative w-full max-w-sm">
            <div className="relative overflow-hidden rounded-[2rem] border-[8px] border-zinc-900 bg-sx-card shadow-sx-glow-lg">
              <Image
                src="/screen-mobile.jpg"
                alt="StackPlus rodando no celular durante o jogo"
                width={900}
                height={1800}
                className="h-auto w-full"
              />
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 -z-10 rounded-3xl bg-sx-cyan/10 blur-3xl"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
