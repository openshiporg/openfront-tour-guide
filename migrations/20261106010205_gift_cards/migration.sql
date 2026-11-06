-- CreateEnum
CREATE TYPE "GiftCardStatusType" AS ENUM ('active', 'void');

-- CreateEnum
CREATE TYPE "GiftCardFundedByType" AS ENUM ('cash', 'complimentary');

-- CreateEnum
CREATE TYPE "GiftCardEntryKindType" AS ENUM ('issue', 'redeem', 'return', 'void');

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL DEFAULT '',
    "last4" TEXT NOT NULL DEFAULT '',
    "status" "GiftCardStatusType" DEFAULT 'active',
    "initialCents" INTEGER DEFAULT 0,
    "balanceCents" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "expiresAt" TIMESTAMP(3),
    "fundedBy" "GiftCardFundedByType" DEFAULT 'cash',
    "recipientName" TEXT NOT NULL DEFAULT '',
    "recipientEmail" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "issuedById" TEXT NOT NULL DEFAULT '',
    "replacesId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardEntry" (
    "id" TEXT NOT NULL,
    "giftCard" TEXT,
    "kind" "GiftCardEntryKindType" DEFAULT 'issue',
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER DEFAULT 0,
    "bookingId" TEXT NOT NULL DEFAULT '',
    "bookingRef" TEXT NOT NULL DEFAULT '',
    "paymentId" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_codeHash_key" ON "GiftCard"("codeHash");

-- CreateIndex
CREATE INDEX "GiftCard_recipientEmail_idx" ON "GiftCard"("recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardEntry_idempotencyKey_key" ON "GiftCardEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GiftCardEntry_giftCard_idx" ON "GiftCardEntry"("giftCard");

-- CreateIndex
CREATE INDEX "GiftCardEntry_bookingId_idx" ON "GiftCardEntry"("bookingId");

-- AddForeignKey
ALTER TABLE "GiftCardEntry" ADD CONSTRAINT "GiftCardEntry_giftCard_fkey" FOREIGN KEY ("giftCard") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
