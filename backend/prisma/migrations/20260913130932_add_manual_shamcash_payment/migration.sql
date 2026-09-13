-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('GATEWAY', 'MANUAL_SHAMCASH');

-- CreateEnum
CREATE TYPE "ManualProofStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_VERIFICATION';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'GATEWAY';

-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN     "shamCashAccountNumber" TEXT,
ADD COLUMN     "shamCashQrImagePath" TEXT;

-- CreateTable
CREATE TABLE "manual_payment_proofs" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "proofImagePath" TEXT NOT NULL,
    "status" "ManualProofStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "manual_payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_payment_proofs_bookingId_key" ON "manual_payment_proofs"("bookingId");

-- CreateIndex
CREATE INDEX "manual_payment_proofs_status_idx" ON "manual_payment_proofs"("status");

-- AddForeignKey
ALTER TABLE "manual_payment_proofs" ADD CONSTRAINT "manual_payment_proofs_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
