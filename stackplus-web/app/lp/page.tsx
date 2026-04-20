import { Hero } from '@/components/landing/Hero'
import { Pain } from '@/components/landing/Pain'
import { BeforeAfter } from '@/components/landing/BeforeAfter'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { HostEgo } from '@/components/landing/HostEgo'
import { MadeForReal } from '@/components/landing/MadeForReal'
import { Objections } from '@/components/landing/Objections'
import { ScreenInUse } from '@/components/landing/ScreenInUse'
import { CtaFinal } from '@/components/landing/CtaFinal'
import { Footer } from '@/components/landing/Footer'

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Pain />
      <BeforeAfter />
      <HowItWorks />
      <HostEgo />
      <MadeForReal />
      <Objections />
      <ScreenInUse />
      <CtaFinal />
      <Footer />
    </main>
  )
}
