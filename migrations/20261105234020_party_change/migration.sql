-- CreateEnum
CREATE TYPE "PartyChangeSourceType" AS ENUM ('guest', 'staff');

-- CreateEnum
CREATE TYPE "PartyChangeStatusType" AS ENUM ('pending_payment', 'applied', 'cancelled', 'failed');

-- CreateTable
CREATE TABLE "PartyChange" (
    "id" TEXT NOT NULL,
    "booking" TEXT,
    "source" "PartyChangeSourceType" DEFAULT 'guest',
    "status" "PartyChangeStatusType" DEFAULT 'pending_payment',
    "plan" JSONB,
    "differenceCents" INTEGER DEFAULT 0,
    "collectCents" INTEGER DEFAULT 0,
    "refundCents" INTEGER DEFAULT 0,
    "keptCents" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "holdId" TEXT NOT NULL DEFAULT '',
    "paymentIntentId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT '',
    "requestKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartyChange_requestKey_key" ON "PartyChange"("requestKey");

-- CreateIndex
CREATE INDEX "PartyChange_booking_idx" ON "PartyChange"("booking");

-- AddForeignKey
ALTER TABLE "PartyChange" ADD CONSTRAINT "PartyChange_booking_fkey" FOREIGN KEY ("booking") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
