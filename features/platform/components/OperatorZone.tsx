'use client'

import { setOperatorZone } from '../lib/format'

export function OperatorZone({ zone, children }: { zone: string; children: React.ReactNode }) {
  setOperatorZone(zone)
  return <>{children}</>
}
