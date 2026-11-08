import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { GraphQLError } from 'graphql'
import { CONSTRAINT_MESSAGES, constraintGraphQLError, constraintRefusal } from './constraint-errors'

test('every rule in the migration has a readable message, and no message is orphaned', () => {
  const sql = readFileSync(new URL('../../../migrations/20261108160000_tour_guide_invariants/migration.sql', import.meta.url), 'utf8')
  const names = [...sql.matchAll(/(?:ADD CONSTRAINT|CREATE (?:UNIQUE INDEX|CONSTRAINT TRIGGER|TRIGGER)) "([^"]+)"/g)].map(m => m[1])
  assert(names.length >= 35)
  // The three capacity triggers share one function that raises 'Departure_within_capacity'; that label is the rule name.
  const sharedTriggers = ['Booking_within_capacity', 'InventoryHold_within_capacity', 'Departure_capacity_within_capacity']
  for (const name of names.filter(n => !sharedTriggers.includes(n))) assert(CONSTRAINT_MESSAGES[name], `${name} has no message`)
  for (const name of Object.keys(CONSTRAINT_MESSAGES)) assert(names.includes(name) || sql.includes(`'${name}:`), `${name} is not in the migration`)
})

test('a CHECK refusal is found in Keystone’s debug text and in the cause chain', () => {
  const keystone = new GraphQLError('Prisma error', { extensions: { code: 'KS_PRISMA_ERROR', debug: { message: 'new row for relation "GiftCard" violates check constraint "GiftCard_valid"' } } })
  assert.equal(constraintRefusal(keystone)?.code, 'TOUR_INVALID_GIFT_CARD')
  const wrapped = new Error('boom'); (wrapped as any).cause = { message: 'violates check constraint "Payment_currency_code"' }
  assert.equal(constraintRefusal(wrapped)?.code, 'TOUR_INVALID_CURRENCY')
})

test('a trigger refusal keeps its rule name', () => {
  assert.equal(constraintRefusal(new Error('ERROR: Departure_within_capacity: 13 seats taken or held against capacity 12'))?.code, 'TOUR_DEPARTURE_FULL')
  assert.equal(constraintRefusal(new Error('ERROR: Refund_within_payment: refunds 2001 exceed payment 2000'))?.code, 'TOUR_REFUND_EXCEEDS_PAYMENT')
})

test('a unique violation is named by index or by its fields', () => {
  assert.equal(constraintRefusal(Object.assign(new Error('x'), { code: 'P2002', meta: { target: ['booking', 'promoCode'] } }))?.code, 'TOUR_DUPLICATE_PROMO')
  assert.equal(constraintRefusal(new Error('Unique constraint failed on the fields: (`departure`,`guide`)'))?.code, 'TOUR_DUPLICATE_ASSIGNMENT')
})

test('unknown errors are left alone and the refusal keeps the path', () => {
  assert.equal(constraintRefusal(new Error('connection reset')), null)
  const out = constraintGraphQLError(new GraphQLError('Prisma error', { path: ['updateTour'] }), { code: 'TOUR_INVALID_RATE', message: 'm' })
  assert.deepEqual([out.message, out.extensions.code, out.path], ['m', 'TOUR_INVALID_RATE', ['updateTour']])
})
