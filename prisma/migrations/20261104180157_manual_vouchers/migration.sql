-- CreateEnum
CREATE TYPE "VoucherKind" AS ENUM ('CAMPAIGN', 'MANUAL');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'AMOUNT');

-- DropForeignKey
ALTER TABLE "Voucher" DROP CONSTRAINT "Voucher_leadId_fkey";

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "discountAmountCents" INTEGER,
ADD COLUMN     "discountType" "DiscountType" NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "holderName" TEXT,
ADD COLUMN     "holderPhone" TEXT,
ADD COLUMN     "kind" "VoucherKind" NOT NULL DEFAULT 'CAMPAIGN',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "restrictedUnitId" TEXT,
ALTER COLUMN "leadId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Voucher_kind_issuedAt_idx" ON "Voucher"("kind", "issuedAt");

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_restrictedUnitId_fkey" FOREIGN KEY ("restrictedUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
