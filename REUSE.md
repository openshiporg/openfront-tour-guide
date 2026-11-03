# Tour Guide reuse record

- Capabilities C01/C02/C13/C16/C19/C20/C35; catalog and source index found under `../fleet-docs/` (skill's root paths are stale).
- Restaurant `models/{PaymentProvider,PaymentCollection,PaymentSession,Payment,Refund,PaymentWebhookEvent,IdempotencyKey}.ts` inspected and copied; only Booking relationship names and order permission mapping adapted. `utils/idempotency.ts` copied unchanged. Payment adapter/config/state/reservation/provider-observation/webhook/refund/approval donors inspected. Stripe package approval pending.
- Airline InventoryBucket/InventoryHold and Scheduling BookingHold inspected: adapt expiry, command-owned rows, recount seats instead of duplicating counters. Gym `mutations/classCapacity.ts`: extract advisory transaction lock; Scheduling `lib/resourceCapacity.ts` copied for half-open peak pool occupancy. Old cited Scheduling mutation path does not exist.
- Restaurant cartProof/cartAccess/cartMutationTransaction inspected: extract guest proof ownership boundary; store SHA-256 digests, validate proof before privileged transactional operations. Holds bind immutable ticket/add-on/policy snapshots.
- Restaurant and commerce onboarding hook/dialog/cards/layout/sidebar/auth/User inspected. Restaurant layout/sidebar-launcher/dialog and ordered hook phases selected for structural adaptation.
- Preserve Core 6.5.1 / Prisma 6.5.0; no dependency install. New baseline uses only this repo's scratch database.
- Verified so far: Keystone schema generation and TypeScript; integer money tests. Runtime checkout/races remain unverified.
