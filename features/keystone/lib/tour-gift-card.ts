// Pure gift card rules. No I/O: tour-gift-cards.ts and tour-checkout.ts load the card under its lock and ask these questions.
import { minor } from './tour-money';

// Codes use the booking-reference alphabet (no 0/O, 1/I/L, U): 12 characters, shown as GC-XXXX-XXXX-XXXX.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export function codeFromBytes(bytes: Uint8Array) {
  if (bytes.length < 12) throw new Error('Need 12 bytes for a gift card code');
  return Array.from(bytes.slice(0, 12), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
export const formatCode = (raw: string) => `GC-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
// What a guest types: any case, with or without the GC- prefix, dashes or spaces. Returns the 12 code characters or '' when it
// cannot be a code (so a lookup never runs on junk).
export function normalizeCode(input: string) {
  let s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 14 && s.startsWith('GC')) s = s.slice(2);
  return s.length === 12 && [...s].every(c => CODE_ALPHABET.includes(c)) ? s : '';
}

export type Card = { status: string; balanceCents: number; currencyCode: string; expiresAt?: Date | string | null };
// Why a card cannot pay right now, or null when it can.
export function unusable(card: Card | null | undefined, currencyCode: string, now = new Date()): string | null {
  if (!card) return 'Gift card not found';
  if (card.status !== 'active') return 'This gift card is no longer valid';
  if (card.expiresAt && new Date(card.expiresAt) <= now) return 'This gift card has expired';
  if (card.currencyCode !== currencyCode) return `This gift card is in ${card.currencyCode}`;
  if (minor(card.balanceCents) <= 0) return 'This gift card has no balance left';
  return null;
}
// How much of a total the card pays; the rest goes on the bank card. Never more than the balance or the total.
export function applyCard(balanceCents: number, totalCents: number) {
  const giftCents = Math.min(minor(balanceCents), minor(totalCents));
  return { giftCents, cardCents: totalCents - giftCents };
}
// Issue amounts: whole minor units, at least 1.00 and at most 2,000.00, so a typo cannot mint a large liability.
export function issueAmount(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 100) throw new Error('Gift card amount must be at least 1.00');
  if (cents > 200000) throw new Error('Gift card amount must be at most 2,000.00');
  return cents;
}
