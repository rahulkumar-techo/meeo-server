-- CreateEnum
CREATE TYPE "TaxVerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'FLAGGED_FOR_REVIEW');

-- CreateEnum
CREATE TYPE "GstTaxTreatment" AS ENUM ('TAXABLE', 'NIL_RATED', 'EXEMPT', 'ZERO_RATED', 'NON_TAXABLE');

-- CreateEnum
CREATE TYPE "GstRuleStatus" AS ENUM ('DRAFT', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "SellerGstRegistrationType" AS ENUM ('REGULAR', 'COMPOSITION', 'UNREGISTERED');

-- CreateEnum
CREATE TYPE "SellerTaxStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "taxClassificationId" UUID;

-- CreateTable
CREATE TABLE "gst_rules" (
    "id" UUID NOT NULL,
    "taxClassificationId" UUID NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "taxTreatment" "GstTaxTreatment" NOT NULL DEFAULT 'TAXABLE',
    "cgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cessRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "notificationRef" TEXT,
    "jurisdiction" TEXT NOT NULL DEFAULT 'IN',
    "status" "GstRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "approvedById" UUID,
    "publishedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gst_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gst_rule_audits" (
    "id" UUID NOT NULL,
    "ruleId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "previousState" JSONB,
    "newState" JSONB,
    "actorId" UUID,
    "reason" TEXT,
    "notificationRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gst_rule_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_tax_snapshots" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sellerProfileId" UUID,
    "sellerLegalName" TEXT NOT NULL,
    "sellerTradeName" TEXT NOT NULL,
    "sellerGstin" TEXT NOT NULL,
    "sellerStateCode" CHAR(2) NOT NULL,
    "customerGstin" TEXT,
    "placeOfSupplyStateCode" CHAR(2) NOT NULL,
    "placeOfSupplyStateName" TEXT NOT NULL,
    "isInterState" BOOLEAN NOT NULL,
    "totalTaxableAmount" DECIMAL(12,2) NOT NULL,
    "totalCgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalSgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalIgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCessAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalTaxAmount" DECIMAL(12,2) NOT NULL,
    "shippingTaxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingGstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "shippingCgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingSgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingIgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "calculationVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_tax_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_tax_snapshots" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "gstRuleId" UUID,
    "hsnCode" TEXT NOT NULL,
    "taxTreatment" "GstTaxTreatment" NOT NULL DEFAULT 'TAXABLE',
    "grossLineTotal" DECIMAL(12,2) NOT NULL,
    "allocatedDiscountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netTaxableAmount" DECIMAL(12,2) NOT NULL,
    "cgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cessRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalTaxAmount" DECIMAL(12,2) NOT NULL,
    "isInclusivePrice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_tax_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_tax_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "legalBusinessName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "gstin" TEXT NOT NULL,
    "stateCode" CHAR(2) NOT NULL,
    "stateName" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "registrationType" "SellerGstRegistrationType" NOT NULL DEFAULT 'REGULAR',
    "status" "SellerTaxStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDefaultPlatformSeller" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_classifications" (
    "id" UUID NOT NULL,
    "hsnCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "verificationStatus" "TaxVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gst_rules_hsnCode_status_effectiveFrom_effectiveTo_idx" ON "gst_rules"("hsnCode", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "gst_rules_status_effectiveFrom_idx" ON "gst_rules"("status", "effectiveFrom");

-- CreateIndex
CREATE INDEX "gst_rule_audits_ruleId_createdAt_idx" ON "gst_rule_audits"("ruleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "order_tax_snapshots_orderId_key" ON "order_tax_snapshots"("orderId");

-- CreateIndex
CREATE INDEX "order_tax_snapshots_orderId_idx" ON "order_tax_snapshots"("orderId");

-- CreateIndex
CREATE INDEX "order_tax_snapshots_placeOfSupplyStateCode_idx" ON "order_tax_snapshots"("placeOfSupplyStateCode");

-- CreateIndex
CREATE UNIQUE INDEX "order_item_tax_snapshots_orderItemId_key" ON "order_item_tax_snapshots"("orderItemId");

-- CreateIndex
CREATE INDEX "order_item_tax_snapshots_orderItemId_idx" ON "order_item_tax_snapshots"("orderItemId");

-- CreateIndex
CREATE INDEX "order_item_tax_snapshots_hsnCode_idx" ON "order_item_tax_snapshots"("hsnCode");

-- CreateIndex
CREATE UNIQUE INDEX "seller_tax_profiles_gstin_key" ON "seller_tax_profiles"("gstin");

-- CreateIndex
CREATE INDEX "seller_tax_profiles_stateCode_idx" ON "seller_tax_profiles"("stateCode");

-- CreateIndex
CREATE INDEX "seller_tax_profiles_isDefaultPlatformSeller_idx" ON "seller_tax_profiles"("isDefaultPlatformSeller");

-- CreateIndex
CREATE UNIQUE INDEX "tax_classifications_hsnCode_key" ON "tax_classifications"("hsnCode");

-- CreateIndex
CREATE INDEX "tax_classifications_verificationStatus_idx" ON "tax_classifications"("verificationStatus");

-- CreateIndex
CREATE INDEX "products_taxClassificationId_idx" ON "products"("taxClassificationId");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_taxClassificationId_fkey" FOREIGN KEY ("taxClassificationId") REFERENCES "tax_classifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_rules" ADD CONSTRAINT "gst_rules_taxClassificationId_fkey" FOREIGN KEY ("taxClassificationId") REFERENCES "tax_classifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_rules" ADD CONSTRAINT "gst_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_rules" ADD CONSTRAINT "gst_rules_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_rules" ADD CONSTRAINT "gst_rules_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_rule_audits" ADD CONSTRAINT "gst_rule_audits_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "gst_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gst_rule_audits" ADD CONSTRAINT "gst_rule_audits_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_tax_snapshots" ADD CONSTRAINT "order_tax_snapshots_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_tax_snapshots" ADD CONSTRAINT "order_tax_snapshots_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "seller_tax_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_tax_snapshots" ADD CONSTRAINT "order_item_tax_snapshots_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_tax_snapshots" ADD CONSTRAINT "order_item_tax_snapshots_gstRuleId_fkey" FOREIGN KEY ("gstRuleId") REFERENCES "gst_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_tax_profiles" ADD CONSTRAINT "seller_tax_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_classifications" ADD CONSTRAINT "tax_classifications_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
