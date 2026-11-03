# Openfront Tour Guide

Run scheduled tours and activities (walking, food, water, bike, van day trips, multi-day and private-only) with capacity, staffing and waivers handled in one system. It replaces the booking, manifest and payout work done today in FareHarbor, Peek Pro, Bókun, Rezdy and Xola. Built on Next.js 16, Keystone 6.5 and PostgreSQL.

## What is built

### Data model (40 lists)
- **Catalog:** Tour, TicketType, AddOn, MeetingPoint, CancellationPolicy, PricingRule, Schedule.
- **Scheduling and capacity:** Departure (virtual booked, held, remaining, guidesNeeded, staffed), Guide, GuideCertification, GuideAvailability, GuideAssignment, Resource, ResourceAssignment.
- **Booking:** Booking, BookingLine, InventoryHold, Participant, WaiverTemplate, WaiverSignature, PromoCode, PromoRedemption.
- **Operations and money:** Channel, ChannelStatement, GuidePayout, OperationalTask, NotificationPreference, StoreSettings, AuditEvent, ManagerApproval.
- **Payments (Restaurant lineage):** PaymentProvider, PaymentCollection, PaymentSession, Payment, Refund, PaymentWebhookEvent, IdempotencyKey.
- Money is integer minor units with a currency code; percentages are basis points.

### Rules enforced in custom GraphQL operations
- Every hold, booking, cancel, resize and check-in takes a transaction advisory lock on the departure; seats are recounted under the lock.
- Holds expire after 10 minutes and release their seats and promo reservations.
- Guide and resource assignment use half-open interval overlap checks under per-guide and per-resource locks; expired certifications block assignment.
- Bookings snapshot ticket names, prices, add-ons, tax, discount and the cancellation policy at purchase. Refunds follow the snapshotted policy in the tour timezone; weather cancellations refund in full.
- Refunds above the settings threshold need a manager approval from another user.
- Every state transition writes an AuditEvent; money-moving operations take an idempotency key.
- Participant medical notes are readable only with a permission, and manifest reads are audited.
- Guest checkout proof is a random token held in an httpOnly cookie; only its SHA-256 digest is stored. Waiver and rebook links are derived tokens verified server-side.

Operations: `toursOnSale`, `tourAvailability`, `createDepartureHold`, `startBookingCheckout`, `completeBookingCheckout`, `lookupBooking`, `cancelMyBooking`, `signWaiver`, `rebookWithCredit`, `generateDepartures`, `assignGuide`, `respondToAssignment`, `assignResource`, `resizeDeparture`, `checkInParticipant`, `markNoShow`, `cancelDeparture`, `closeDeparture`, `createChannelBooking`, `refundBooking`, `generateChannelStatement`, `sweepDepartures`.

### Dashboard (`/dashboard/platform/*`)
Today, Calendar, Bookings (status tabs, refunds), Check-in (mobile manifest), Guides, and list screens for Tours, Waivers, Promo codes, Resources, Channels, Customers, Payment providers and Settings. Onboarding in the sidebar creates a full operator (6 tours, 8 guides, fleet, channels, departures, bookings, one weather cancellation and completed history) or a minimal one.

### Storefront
Plain pages for the core loop: tours, tour page with date picker, ticket quantities and add-ons, seat hold with timer, participant names, Stripe card payment, confirmation with booking code, meeting point and waiver links. Also `/lookup` by booking code and email, and guest cancellation under the policy.

### MCP
`/api/mcp-transport/mcp` exposes the Keystone schema to MCP clients under the caller's own access (OAuth or session). Raw writes to command-only lists such as bookings are denied.

## Getting started

```bash
# .env needs: DATABASE_URL, SHADOW_DATABASE_URL, SESSION_SECRET (48+ chars),
# PUBLIC_SIGNUPS_ALLOWED=false, NEXT_PUBLIC_STRIPE_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
npm install
npm run dev
```

Open `/dashboard/init` to create the first admin, then use the sidebar setup card.

## Tests

```bash
node --import tsx --test features/keystone/lib/*.test.ts
```

## The Openfront Ecosystem

Every Openfront is open source and self-hostable.

|---|---|
| **Storefront** | [restaurant.openship.org](https://restaurant.openship.org) |
| **Dashboard** | [restaurant.openship.org/dashboard](https://restaurant.openship.org/dashboard) |
| **User** | `craft@openship.org` |
| Product | For | Repository | Demo | Docs |
|---|---|---|---|---|
| Openfront E-commerce | Online store: catalog, checkout, orders, fulfillment | [openfront](https://github.com/openshiporg/openfront) | [e-commerce.openship.org](https://e-commerce.openship.org) | [Docs](https://docs.openship.org/docs/openfront/ecommerce) |
| Openfront Restaurant | Online ordering, POS and kitchen display | [openfront-restaurant](https://github.com/openshiporg/openfront-restaurant) | [restaurant.openship.org](https://restaurant.openship.org) | [Docs](https://docs.openship.org/docs/openfront/restaurant) |
| Openfront Grocery | Grocery ordering, lots, expiry and pickup | [openfront-grocery](https://github.com/openshiporg/openfront-grocery) | [grocery.openship.org](https://grocery.openship.org) | [Docs](https://docs.openship.org/docs/openfront/grocery) |
| Openfront Gym | Memberships, classes, check-in and billing | [openfront-gym](https://github.com/openshiporg/openfront-gym) | [gym.openship.org](https://gym.openship.org) | [Docs](https://docs.openship.org/docs/openfront/gym) |
| Openfront Hotel | Reservations, front desk, housekeeping, folios | [openfront-hotel](https://github.com/openshiporg/openfront-hotel) | [hotel.openship.org](https://hotel.openship.org) | [Docs](https://docs.openship.org/docs/openfront/hotel) |
| Openfront Rental | Short-term rental bookings and calendars | [openfront-rental](https://github.com/openshiporg/openfront-rental) | [rental.openship.org](https://rental.openship.org) | [Docs](https://docs.openship.org/docs/openfront/rental) |
| Openfront Salon | Appointments, stylists and services | [openfront-salon](https://github.com/openshiporg/openfront-salon) | [salon.openship.org](https://salon.openship.org) | [Docs](https://docs.openship.org/docs/openfront/salon) |
| Openfront Barbershop | Bookings, walk-ins and barbers | [openfront-barbershop](https://github.com/openshiporg/openfront-barbershop) | [barbershop.openship.org](https://barbershop.openship.org) | [Docs](https://docs.openship.org/docs/openfront/barbershop) |
| Openfront Coffee Shop | Café ordering and counter POS | [openfront-coffeeshop](https://github.com/openshiporg/openfront-coffeeshop) | [coffee-shop.openship.org](https://coffee-shop.openship.org) | [Docs](https://docs.openship.org/docs/openfront/coffee-shop) |
| Openfront Real Estate | Listings, showings and transactions | [openfront-realestate](https://github.com/openshiporg/openfront-realestate) | [real-estate.openship.org](https://real-estate.openship.org) | [Docs](https://docs.openship.org/docs/openfront/real-estate) |
| Openfront Dealership | Inventory, test drives, deals and service | [openfront-dealership](https://github.com/openshiporg/openfront-dealership) | [dealership.openship.org](https://dealership.openship.org) | [Docs](https://docs.openship.org/docs/openfront/dealership) |
| Openfront Vape | Age-gated retail with compliance controls | [openfront-vape](https://github.com/openshiporg/openfront-vape) | [vape.openship.org](https://vape.openship.org) | [Docs](https://docs.openship.org/docs/openfront/vape) |
| Openfront Convenience | Convenience store POS and inventory | [openfront-convenience](https://github.com/openshiporg/openfront-convenience) | [convenience.openship.org](https://convenience.openship.org) | [Docs](https://docs.openship.org/docs/openfront/convenience) |
| Openfront Collectibles | Graded items, consignment and provenance | [openfront-collectibles](https://github.com/openshiporg/openfront-collectibles) | [collectibles.openship.org](https://collectibles.openship.org) | [Docs](https://docs.openship.org/docs/openfront/collectibles) |
| Openfront Cannabis | Dispensary menu, packages and recalls | [openfront-cannabis](https://github.com/openshiporg/openfront-cannabis) | [cannabis.openship.org](https://cannabis.openship.org) | [Docs](https://docs.openship.org/docs/openfront/cannabis) |
| Openfront Pharmacy | Prescriptions, inventory lots and pickup | [openfront-pharmacy](https://github.com/openshiporg/openfront-pharmacy) | [pharmacy.openship.org](https://pharmacy.openship.org) | [Docs](https://docs.openship.org/docs/openfront/pharmacy) |
| Openfront Med Spa | Treatments, consents and memberships | [openfront-medspa](https://github.com/openshiporg/openfront-medspa) | [medspa.openship.org](https://medspa.openship.org) | [Docs](https://docs.openship.org/docs/openfront/medspa) |
| Openfront Construction | Projects, bids, change orders and crews | [openfront-construction](https://github.com/openshiporg/openfront-construction) | [construction.openship.org](https://construction.openship.org) | [Docs](https://docs.openship.org/docs/openfront/construction) |
| Openfront Law Firm | Matters, intake, time and billing | [openfront-law-firm](https://github.com/openshiporg/openfront-law-firm) | [law-firm.openship.org](https://law-firm.openship.org) | [Docs](https://docs.openship.org/docs/openfront/law-firm) |
| Openfront Scheduling | Booking pages for appointment businesses | [openfront-scheduling](https://github.com/openshiporg/openfront-scheduling) | [scheduling.openship.org](https://scheduling.openship.org) | [Docs](https://docs.openship.org/docs/openfront/scheduling) |
| Openfront Social | Creator community and posts | [openfront-social](https://github.com/openshiporg/openfront-social) | [social.openship.org](https://social.openship.org) | [Docs](https://docs.openship.org/docs/openfront/social) |
| Openfront Rideshare | Rides, drivers and dispatch | [openfront-rideshare](https://github.com/openshiporg/openfront-rideshare) | [rideshare.openship.org](https://rideshare.openship.org) | [Docs](https://docs.openship.org/docs/openfront/rideshare) |
| Openfront Airline | Flights, booking and passenger operations | [openfront-airline](https://github.com/openshiporg/openfront-airline) | [airline.openship.org](https://airline.openship.org) | [Docs](https://docs.openship.org/docs/openfront/airline) |
| Openfront Hospital | Appointments, patients and care teams | [openfront-hospital](https://github.com/openshiporg/openfront-hospital) | [hospital.openship.org](https://hospital.openship.org) | [Docs](https://docs.openship.org/docs/openfront/hospital) |
| Openfront Sportsbook | Markets, bets and results | [openfront-sportsbook](https://github.com/openshiporg/openfront-sportsbook) | [sportsbook.openship.org](https://sportsbook.openship.org) | [Docs](https://docs.openship.org/docs/openfront/sportsbook) |
| Openfront Financial | Accounts, portfolios and advisory | [openfront-financial](https://github.com/openshiporg/openfront-financial) | [financial.openship.org](https://financial.openship.org) | [Docs](https://docs.openship.org/docs/openfront/financial) |
| Openfront Analytics | Privacy-friendly website analytics | [analytics](https://github.com/openshiporg/analytics) | [analytics.openship.org](https://analytics.openship.org) | [Docs](https://docs.openship.org/docs/openfront/analytics) |
| **Openfront Tour Guide** (this repository) | Scheduled departures, guides, fleet, waivers and reseller channels | [openfront-tour-guide](https://github.com/openshiporg/openfront-tour-guide) | | |
| Openship | Order routing from sales channels to fulfillment | [openship](https://github.com/openshiporg/openship) | [os.openship.org](https://os.openship.org) | [Docs](https://docs.openship.org/docs/openship/ecommerce) |
| Marketplace | Shop across Openfront stores | [marketplace](https://github.com/openshiporg/marketplace) | [marketplace.openship.org](https://marketplace.openship.org) | [Docs](https://docs.openship.org/docs/openfront/marketplace) |
