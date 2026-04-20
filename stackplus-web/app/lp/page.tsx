import { Hero } from '@/components/landing/Hero'
import { Pain } from '@/components/landing/Pain'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Features } from '@/components/landing/Features'
import { Pricing } from '@/components/landing/Pricing'
import { Faq } from '@/components/landing/Faq'
import { CtaFinal } from '@/components/landing/CtaFinal'
import { Footer } from '@/components/landing/Footer'

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Pain />
      <HowItWorks />
      <Features />
      <Pricing />
      <Faq />
      <CtaFinal />
      <Footer />
    </main>
  )
}
