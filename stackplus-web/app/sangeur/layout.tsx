import { Suspense } from 'react'

export default function SangeurLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>
}
