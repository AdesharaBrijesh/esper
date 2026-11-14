-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'GAVE';
ALTER TYPE "TransactionType" ADD VALUE 'GOT';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "personId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_userId_personId_idx" ON "Transaction"("userId", "personId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
