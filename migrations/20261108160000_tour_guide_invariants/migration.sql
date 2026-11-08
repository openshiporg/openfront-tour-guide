-- Rules the app already relied on, now enforced by the database. Every predicate below was run verbatim against live data first: 0 violations.

ALTER TABLE "Booking" ADD CONSTRAINT "Booking_amounts_valid" CHECK ("subtotalCents" >= 0 AND "addOnsCents" >= 0 AND "discountCents" >= 0 AND "taxCents" >= 0 AND "feeCents" >= 0 AND "totalCents" >= 0 AND "channelCommissionCents" >= 0 AND "refundedCents" >= 0 AND "seats" >= 0),
  ADD CONSTRAINT "Booking_refunded_within_total" CHECK ("refundedCents" <= "totalCents");
ALTER TABLE "BookingLine" ADD CONSTRAINT "BookingLine_amounts_valid" CHECK ("unitPriceCents" >= 0 AND "seatsUsed" >= 0 AND "feeCents" >= 0 AND "taxCents" >= 0 AND "totalCents" >= 0);
ALTER TABLE "AddOn" ADD CONSTRAINT "AddOn_price_valid" CHECK ("priceCents" >= 0);
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_valid" CHECK ("priceCents" >= 0 AND "seatsUsed" >= 0 AND ("minAge" IS NULL OR "minAge" >= 0) AND ("maxAge" IS NULL OR "maxAge" >= 0) AND ("minAge" IS NULL OR "maxAge" IS NULL OR "minAge" <= "maxAge"));
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_rate_valid" CHECK ("commissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "ChannelStatement"
  ADD CONSTRAINT "ChannelStatement_amounts_valid" CHECK ("grossCents" >= 0 AND "commissionCents" >= 0 AND "commissionCents" <= "grossCents"),
  ADD CONSTRAINT "ChannelStatement_period_order" CHECK ("periodStart" IS NULL OR "periodEnd" IS NULL OR "periodStart" <= "periodEnd");
ALTER TABLE "Departure" ADD CONSTRAINT "Departure_valid" CHECK ("capacity" >= 0 AND "startAt" <= "endAt" AND ("bookingCutoffMinutes" IS NULL OR "bookingCutoffMinutes" >= 0));
ALTER TABLE "Tour"
  ADD CONSTRAINT "Tour_valid" CHECK (("durationMinutes" IS NULL OR "durationMinutes" >= 0) AND ("durationDays" IS NULL OR "durationDays" >= 0) AND "minParticipants" >= 0 AND "maxParticipants" >= 0 AND ("minAge" IS NULL OR "minAge" >= 0)),
  ADD CONSTRAINT "Tour_participants_order" CHECK ("minParticipants" <= "maxParticipants");
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_valid" CHECK ("initialCents" >= 0 AND "balanceCents" >= 0 AND "balanceCents" <= "initialCents");
ALTER TABLE "GiftCardEntry" ADD CONSTRAINT "GiftCardEntry_valid" CHECK ("amountCents" <> 0 AND "balanceAfterCents" >= 0);
ALTER TABLE "Guide" ADD CONSTRAINT "Guide_rate_valid" CHECK ("payRateCents" >= 0);
ALTER TABLE "GuideAssignment" ADD CONSTRAINT "GuideAssignment_pay_valid" CHECK ("payCents" >= 0);
ALTER TABLE "GuideAvailability" ADD CONSTRAINT "GuideAvailability_order" CHECK ("startAt" IS NULL OR "endAt" IS NULL OR "startAt" < "endAt");
ALTER TABLE "GuidePayout" ADD CONSTRAINT "GuidePayout_valid" CHECK ("totalCents" >= 0 AND ("periodStart" IS NULL OR "periodEnd" IS NULL OR "periodStart" <= "periodEnd"));
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "ManagerApproval"
  ADD CONSTRAINT "ManagerApproval_amount_valid" CHECK ("amount" IS NULL OR "amount" >= 0),
  ADD CONSTRAINT "ManagerApproval_time_order" CHECK ("expiresAt" IS NULL OR "requestedAt" IS NULL OR "requestedAt" <= "expiresAt");
ALTER TABLE "PartyChange" ADD CONSTRAINT "PartyChange_amounts_valid" CHECK ("collectCents" >= 0 AND "refundCents" >= 0 AND "keptCents" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amounts_valid" CHECK ("amount" > 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PaymentCollection" ADD CONSTRAINT "PaymentCollection_amounts_valid" CHECK ("amount" >= 0 AND "authorizedAmount" >= 0 AND "refundedAmount" >= 0);
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_amount_valid" CHECK ("amount" >= 0);
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_price_valid" CHECK ("overridePriceCents" IS NULL OR "overridePriceCents" >= 0);
ALTER TABLE "PromoCode"
  ADD CONSTRAINT "PromoCode_valid" CHECK ("value" >= 0 AND ("maxUses" IS NULL OR "maxUses" >= 0) AND "usedCount" >= 0 AND ("perOrderLimit" IS NULL OR "perOrderLimit" >= 1) AND ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" <= "endsAt")),
  ADD CONSTRAINT "PromoCode_used_within_max" CHECK ("maxUses" IS NULL OR "usedCount" <= "maxUses");
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_amount_valid" CHECK ("amountCents" >= 0);
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_valid" CHECK ("seats" >= 0 AND "quantity" >= 1);
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_quantity_valid" CHECK ("quantity" >= 1);
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_capacity_valid" CHECK ("capacityOverride" IS NULL OR "capacityOverride" >= 0);
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_valid" CHECK ("refundApprovalThresholdCents" >= 0 AND "taxBps" BETWEEN 0 AND 10000 AND "waitlistOfferHours" >= 0);
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_seats_valid" CHECK ("seats" >= 1);

-- ISO currency wherever money is stored
ALTER TABLE "AddOn" ADD CONSTRAINT "AddOn_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "BookingLine" ADD CONSTRAINT "BookingLine_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "ChannelStatement" ADD CONSTRAINT "ChannelStatement_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Guide" ADD CONSTRAINT "Guide_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "GuideAssignment" ADD CONSTRAINT "GuideAssignment_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "GuidePayout" ADD CONSTRAINT "GuidePayout_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "PartyChange" ADD CONSTRAINT "PartyChange_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_currency_code" CHECK ("currencyCode" ~ '^[A-Z]{3}$');

-- Seats never exceed a departure's capacity: counted bookings plus unexpired active holds. Checked when the transaction commits
-- (a hold converts to a booking inside one transaction, so the two are briefly both present), with the departure row locked so
-- two concurrent checkouts are counted one after the other. Prisma drops the constraint name from trigger errors, so the rule name leads the message.
CREATE FUNCTION tour_guide_departure_within_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  dep TEXT;
  cap INTEGER;
  taken BIGINT;
BEGIN
  IF TG_TABLE_NAME = 'Departure' THEN dep := NEW."id"; ELSE dep := NEW."departure"; END IF;
  IF dep IS NULL THEN RETURN NULL; END IF;
  SELECT "capacity" INTO cap FROM "Departure" WHERE "id" = dep FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE((SELECT SUM("seats") FROM "Booking" WHERE "departure" = dep AND "status" IN ('confirmed','checked_in','completed','no_show','partially_refunded')), 0)
       + COALESCE((SELECT SUM("quantity") FROM "InventoryHold" WHERE "departure" = dep AND "status" = 'active' AND "expiresAt" > now()), 0) INTO taken;
  IF taken > cap THEN
    RAISE EXCEPTION 'Departure_within_capacity: % seats taken or held against capacity %', taken, cap USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Booking_within_capacity"
  AFTER INSERT OR UPDATE OF "seats", "status", "departure" ON "Booking"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tour_guide_departure_within_capacity();
CREATE CONSTRAINT TRIGGER "InventoryHold_within_capacity"
  AFTER INSERT OR UPDATE OF "quantity", "status", "departure", "expiresAt" ON "InventoryHold"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tour_guide_departure_within_capacity();
CREATE CONSTRAINT TRIGGER "Departure_capacity_within_capacity"
  AFTER UPDATE OF "capacity" ON "Departure"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tour_guide_departure_within_capacity();

-- Refunds never exceed the payment, in the payment's currency (payment row locked).
CREATE FUNCTION tour_guide_refund_within_payment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  paid RECORD;
  refunded BIGINT;
BEGIN
  IF NEW."payment" IS NULL THEN RETURN NULL; END IF;
  SELECT "amount", "currencyCode" INTO paid FROM "Payment" WHERE "id" = NEW."payment" FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NEW."currencyCode" <> paid."currencyCode" THEN
    RAISE EXCEPTION 'Refund_within_payment: refund currency % differs from payment currency %', NEW."currencyCode", paid."currencyCode" USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO refunded FROM "Refund"
    WHERE "payment" = NEW."payment" AND "status" IN ('processing', 'unknown', 'succeeded');
  IF refunded > paid."amount" THEN
    RAISE EXCEPTION 'Refund_within_payment: refunds % exceed payment %', refunded, paid."amount" USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Refund_within_payment"
  AFTER INSERT OR UPDATE OF "amount", "status", "payment", "currencyCode" ON "Refund"
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION tour_guide_refund_within_payment();

-- Uniqueness, as partial indexes so Prisma leaves them alone.
CREATE UNIQUE INDEX "PromoRedemption_promo_booking_key" ON "PromoRedemption"("promoCode", "booking") WHERE "promoCode" IS NOT NULL AND "booking" IS NOT NULL AND "status" <> 'released';
CREATE UNIQUE INDEX "GuideAssignment_departure_guide_key" ON "GuideAssignment"("departure", "guide") WHERE "departure" IS NOT NULL AND "guide" IS NOT NULL AND "status" IN ('offered', 'accepted', 'worked');
