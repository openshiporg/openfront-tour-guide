-- CreateTable
CREATE TABLE "ManagerApproval" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "amount" INTEGER,
    "requestFingerprint" TEXT NOT NULL DEFAULT '',
    "requestPayload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedEntityType" TEXT NOT NULL DEFAULT '',
    "consumedEntityId" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagerApproval_actionType_idx" ON "ManagerApproval"("actionType");

-- CreateIndex
CREATE INDEX "ManagerApproval_targetId_idx" ON "ManagerApproval"("targetId");

-- CreateIndex
CREATE INDEX "ManagerApproval_status_idx" ON "ManagerApproval"("status");

-- CreateIndex
CREATE INDEX "ManagerApproval_requestedAt_idx" ON "ManagerApproval"("requestedAt");

-- CreateIndex
CREATE INDEX "ManagerApproval_expiresAt_idx" ON "ManagerApproval"("expiresAt");

-- CreateIndex
CREATE INDEX "ManagerApproval_requestedBy_idx" ON "ManagerApproval"("requestedBy");

-- CreateIndex
CREATE INDEX "ManagerApproval_approvedBy_idx" ON "ManagerApproval"("approvedBy");

-- AddForeignKey
ALTER TABLE "ManagerApproval" ADD CONSTRAINT "ManagerApproval_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerApproval" ADD CONSTRAINT "ManagerApproval_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
