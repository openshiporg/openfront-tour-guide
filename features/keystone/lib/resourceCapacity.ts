export type ResourceRequirementInput = {
  requirementId: string
  resourceId: string
  name: string
  capacity: number
  units: number
}

export type ResourceAllocationInput = {
  resourceId: string
  units: number
  startsAt: Date | string
  endsAt: Date | string
  status?: string | null
  expiresAt?: Date | string | null
}

type CapacityIntervalInput = {
  units: number
  startsAt: Date | string
  endsAt: Date | string
  status?: string | null
  expiresAt?: Date | string | null
}

function milliseconds(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  return date.getTime()
}

/**
 * Peak concurrent occupied units over half-open allocation intervals. Intervals are clipped to
 * the optional candidate window; end points are processed before starts at the same instant, so
 * back-to-back bookings do not overlap. Returns null for malformed active data (fail closed).
 */
export function peakConcurrentResourceUnits(
  allocations: CapacityIntervalInput[],
  options: { startsAt?: Date | string; endsAt?: Date | string; nowMs?: number } = {},
): number | null {
  const hasStart = options.startsAt !== undefined
  const hasEnd = options.endsAt !== undefined
  if (hasStart !== hasEnd) return null
  const windowStart = hasStart ? milliseconds(options.startsAt!) : Number.NEGATIVE_INFINITY
  const windowEnd = hasEnd ? milliseconds(options.endsAt!) : Number.POSITIVE_INFINITY
  const nowMs = options.nowMs ?? Date.now()
  if (hasStart && (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart)) return null
  if (!Number.isFinite(nowMs)) return null

  const points: Array<{ at: number; delta: number }> = []
  for (const allocation of allocations) {
    if (allocation.status != null && !['held', 'reserved'].includes(allocation.status)) continue
    if (allocation.status === 'held' && allocation.expiresAt != null && milliseconds(allocation.expiresAt) <= nowMs) continue
    if (!Number.isInteger(allocation.units) || allocation.units < 1) return null
    const allocationStart = milliseconds(allocation.startsAt)
    const allocationEnd = milliseconds(allocation.endsAt)
    if (!Number.isFinite(allocationStart) || !Number.isFinite(allocationEnd) || allocationEnd <= allocationStart) return null
    const start = Math.max(allocationStart, windowStart)
    const end = Math.min(allocationEnd, windowEnd)
    if (end <= start) continue
    points.push({ at: start, delta: allocation.units }, { at: end, delta: -allocation.units })
  }

  points.sort((left, right) => left.at - right.at || left.delta - right.delta)
  let occupied = 0
  let peak = 0
  for (const point of points) {
    occupied += point.delta
    peak = Math.max(peak, occupied)
  }
  return peak
}

export function resourceCapacitySupportsAllocations(input: {
  capacity: number
  allocations: CapacityIntervalInput[]
  nowMs?: number
}) {
  if (!Number.isInteger(input.capacity) || input.capacity < 1) return false
  const peak = peakConcurrentResourceUnits(input.allocations, { nowMs: input.nowMs })
  return peak !== null && peak <= input.capacity
}

export async function lockSchedulingResourceCapacity(tx: any, resourceId: string) {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    'scheduling-resource',
    `resource:${resourceId}`,
  )
}

export async function assertResourceCapacitySupportsActiveAllocations(
  tx: any,
  resourceId: string,
  capacity: number,
  now = new Date(),
  options: { resourceLocked?: boolean } = {},
) {
  if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Resource capacity must be a positive integer.')
  if (!options.resourceLocked) await lockSchedulingResourceCapacity(tx, resourceId)
  const allocations = await tx.resourceAllocation.findMany({
    where: {
      resourceId,
      status: { in: ['held', 'reserved'] },
      OR: [
        { status: 'reserved' },
        { status: 'held', expiresAt: null },
        { status: 'held', expiresAt: { gt: now } },
      ],
    },
    select: { startsAt: true, endsAt: true, units: true, status: true, expiresAt: true },
  })
  if (!resourceCapacitySupportsAllocations({ capacity, allocations, nowMs: now.getTime() })) {
    throw new Error('Resource capacity cannot be reduced below active allocations.')
  }
}

export function resourceCapacityAvailable(input: {
  requirements: ResourceRequirementInput[]
  allocations: ResourceAllocationInput[]
  startsAt: Date | string
  endsAt: Date | string
  nowMs: number
}) {
  const startMs = milliseconds(input.startsAt)
  const endMs = milliseconds(input.endsAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false
  const requirementsByResource = new Map<string, { capacity: number; units: number }>()
  for (const requirement of input.requirements) {
    if (
      !requirement.resourceId ||
      !Number.isInteger(requirement.capacity) ||
      !Number.isInteger(requirement.units) ||
      requirement.capacity < 1 ||
      requirement.units < 1 ||
      requirement.units > requirement.capacity
    ) return false
    const existing = requirementsByResource.get(requirement.resourceId)
    if (existing) {
      if (existing.capacity !== requirement.capacity) return false
      existing.units += requirement.units
      if (existing.units > existing.capacity) return false
    } else {
      requirementsByResource.set(requirement.resourceId, { capacity: requirement.capacity, units: requirement.units })
    }
  }

  for (const [resourceId, requirement] of requirementsByResource) {
    const peak = peakConcurrentResourceUnits([
      ...input.allocations.filter(allocation => allocation.resourceId === resourceId),
      { units: requirement.units, startsAt: input.startsAt, endsAt: input.endsAt, status: 'reserved' },
    ], { startsAt: input.startsAt, endsAt: input.endsAt, nowMs: input.nowMs })
    if (peak === null || peak > requirement.capacity) return false
  }
  return true
}

export function bufferedResourceInterval(input: {
  startsAt: Date
  endsAt: Date
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
}) {
  return {
    startsAt: new Date(input.startsAt.getTime() - Math.max(0, input.bufferBeforeMinutes) * 60_000),
    endsAt: new Date(input.endsAt.getTime() + Math.max(0, input.bufferAfterMinutes) * 60_000),
  }
}

const HOLD_RESOURCE_CONFIGURATION_MISMATCH = 'This booking hold no longer matches the current scheduling requirements. Please choose the time again.'

export async function assertHoldResourceAllocationsMatchRequirements(tx: any, input: {
  holdId: string
  startsAt: Date
  heldEndsAt: Date
  durationMinutes: number
  requirements: ResourceRequirementInput[]
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
}) {
  const failClosed = () => { throw new Error(HOLD_RESOURCE_CONFIGURATION_MISMATCH) }
  const startMs = milliseconds(input.startsAt)
  const heldEndMs = milliseconds(input.heldEndsAt)
  if (!input.holdId || !Number.isFinite(startMs) || !Number.isFinite(heldEndMs) ||
      !Number.isInteger(input.durationMinutes) || input.durationMinutes < 1) failClosed()

  const expectedEnd = new Date(startMs + input.durationMinutes * 60_000)
  if (heldEndMs !== expectedEnd.getTime()) failClosed()
  const expectedInterval = bufferedResourceInterval({
    startsAt: input.startsAt,
    endsAt: expectedEnd,
    bufferBeforeMinutes: input.bufferBeforeMinutes,
    bufferAfterMinutes: input.bufferAfterMinutes,
  })
  const expectedStartMs = expectedInterval.startsAt.getTime()
  const expectedAllocationEndMs = expectedInterval.endsAt.getTime()
  if (!Number.isFinite(expectedStartMs) || !Number.isFinite(expectedAllocationEndMs) || expectedAllocationEndMs <= expectedStartMs) failClosed()

  const expected = input.requirements.map(requirement => {
    if (!requirement.resourceId || !Number.isInteger(requirement.units) || requirement.units < 1 ||
        !Number.isInteger(requirement.capacity) || requirement.capacity < requirement.units) failClosed()
    return { resourceId: requirement.resourceId, units: requirement.units }
  }).sort((left, right) => left.resourceId.localeCompare(right.resourceId))
  if (new Set(expected.map(requirement => requirement.resourceId)).size !== expected.length) failClosed()

  const allocations = await tx.resourceAllocation.findMany({
    where: { holdId: input.holdId },
    select: { resourceId: true, units: true, startsAt: true, endsAt: true, status: true },
  })
  if (allocations.length !== expected.length) failClosed()
  const actual = allocations.map((allocation: any) => {
    if (allocation.status !== 'held') failClosed()
    const startsAt = milliseconds(allocation.startsAt)
    const endsAt = milliseconds(allocation.endsAt)
    if (!allocation.resourceId || !Number.isInteger(allocation.units) || allocation.units < 1 ||
        !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) failClosed()
    return {
      resourceId: allocation.resourceId,
      units: allocation.units,
      startsAt,
      endsAt,
    }
  }).sort((left: any, right: any) => left.resourceId.localeCompare(right.resourceId))

  for (const [index, requirement] of expected.entries()) {
    const allocation = actual[index]
    if (
      allocation.resourceId !== requirement.resourceId ||
      allocation.units !== requirement.units ||
      allocation.startsAt !== expectedStartMs ||
      allocation.endsAt !== expectedAllocationEndMs
    ) failClosed()
  }
}

export async function createHoldResourceAllocations(
  tx: any,
  input: {
    holdId: string
    allocationPrefix: string
    requirements: ResourceRequirementInput[]
    startsAt: Date
    endsAt: Date
    expiresAt: Date
    bufferBeforeMinutes: number
    bufferAfterMinutes: number
  },
) {
  if (input.requirements.length === 0) return 0
  const interval = bufferedResourceInterval(input)
  for (const requirement of input.requirements) {
    await tx.resourceAllocation.create({
      data: {
        allocationKey: `${input.allocationPrefix}:${requirement.resourceId}`,
        resourceId: requirement.resourceId,
        holdId: input.holdId,
        units: requirement.units,
        status: 'held',
        startsAt: interval.startsAt,
        endsAt: interval.endsAt,
        expiresAt: input.expiresAt,
        metadata: { requirementId: requirement.requirementId },
      },
    })
  }
  return input.requirements.length
}

export async function convertHoldResourceAllocations(tx: any, holdId: string, bookingId: string) {
  return tx.resourceAllocation.updateMany({
    where: { holdId, status: 'held' },
    data: { bookingId, holdId: null, status: 'reserved', expiresAt: null },
  })
}

export async function releaseBookingResourceAllocations(tx: any, bookingId: string, reason: string) {
  const rows = await tx.resourceAllocation.findMany({
    where: { bookingId, status: { in: ['held', 'reserved'] } },
    select: { id: true, metadata: true },
  })
  for (const row of rows) {
    await tx.resourceAllocation.update({
      where: { id: row.id },
      data: {
        status: 'released',
        metadata: {
          ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
          releaseReason: reason,
          releasedAt: new Date().toISOString(),
        },
      },
    })
  }
  return rows.length
}

export async function rescheduleBookingResourceAllocations(
  tx: any,
  input: {
    bookingId: string
    requirements: ResourceRequirementInput[]
    startsAt: Date
    endsAt: Date
    bufferBeforeMinutes: number
    bufferAfterMinutes: number
  },
) {
  const interval = bufferedResourceInterval(input)
  const existing = await tx.resourceAllocation.findMany({ where: { bookingId: input.bookingId } })
  const byResource = new Map(existing.map((row: any) => [row.resourceId, row]))
  for (const requirement of input.requirements) {
    const row = byResource.get(requirement.resourceId) as any
    if (row) {
      await tx.resourceAllocation.update({
        where: { id: row.id },
        data: { units: requirement.units, startsAt: interval.startsAt, endsAt: interval.endsAt, status: 'reserved', expiresAt: null },
      })
      byResource.delete(requirement.resourceId)
    } else {
      await tx.resourceAllocation.create({
        data: {
          allocationKey: `booking:${input.bookingId}:${requirement.resourceId}`,
          resourceId: requirement.resourceId,
          bookingId: input.bookingId,
          units: requirement.units,
          status: 'reserved',
          startsAt: interval.startsAt,
          endsAt: interval.endsAt,
          metadata: { requirementId: requirement.requirementId, source: 'booking-reschedule' },
        },
      })
    }
  }
  for (const row of byResource.values()) {
    if ((row as any).status === 'reserved') await tx.resourceAllocation.update({ where: { id: (row as any).id }, data: { status: 'released' } })
  }
}
