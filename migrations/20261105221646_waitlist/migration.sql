-- CreateEnum
CREATE TYPE "WaitlistEntrySourceType" AS ENUM ('online', 'phone');

-- CreateEnum
CREATE TYPE "WaitlistEntryStatusType" AS ENUM ('waiting', 'offered', 'converted', 'expired', 'withdrawn');

-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "waitlistOfferHours" INTEGER DEFAULT 12;

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "departure" TEXT,
    "guestName" TEXT NOT NULL DEFAULT '',
    "guestEmail" TEXT NOT NULL DEFAULT '',
    "guestPhone" TEXT NOT NULL DEFAULT '',
    "seats" INTEGER NOT NULL,
    "tickets" JSONB,
    "source" "WaitlistEntrySourceType" DEFAULT 'online',
    "status" "WaitlistEntryStatusType" DEFAULT 'waiting',
    "offerHoldId" TEXT NOT NULL DEFAULT '',
    "offeredAt" TIMESTAMP(3),
    "offerExpiresAt" TIMESTAMP(3),
    "bookingRef" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_departure_idx" ON "WaitlistEntry"("departure");

-- CreateIndex
CREATE INDEX "WaitlistEntry_guestEmail_idx" ON "WaitlistEntry"("guestEmail");

-- CreateIndex
CREATE INDEX "WaitlistEntry_offerHoldId_idx" ON "WaitlistEntry"("offerHoldId");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_departure_fkey" FOREIGN KEY ("departure") REFERENCES "Departure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
