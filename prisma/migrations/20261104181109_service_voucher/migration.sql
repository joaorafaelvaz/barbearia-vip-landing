-- AlterEnum
ALTER TYPE "DiscountType" ADD VALUE 'SERVICE';

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "serviceName" TEXT;
