-- CreateEnum
CREATE TYPE "UserEventType" AS ENUM ('SESSION_STARTED', 'SESSION_ENDED', 'PRODUCT_VIEWED', 'PRODUCT_SEARCHED', 'CATEGORY_VIEWED', 'FILTER_USED', 'SORT_USED', 'WISHLIST_ADDED', 'WISHLIST_REMOVED', 'CART_ADDED', 'CART_REMOVED', 'CHECKOUT_STARTED', 'PAYMENT_STARTED', 'PAYMENT_FAILED', 'PAYMENT_SUCCESS', 'ORDER_CREATED', 'ORDER_CANCELLED', 'ORDER_COMPLETED', 'REVIEW_CREATED', 'COUPON_APPLIED', 'COUPON_FAILED');

-- CreateEnum
CREATE TYPE "UserInterestType" AS ENUM ('CATEGORY', 'BRAND', 'PRODUCT');

-- CreateTable
CREATE TABLE "user_behavior_summary" (
    "userId" UUID NOT NULL,
    "productViews" INTEGER NOT NULL DEFAULT 0,
    "searches" INTEGER NOT NULL DEFAULT 0,
    "categoryViews" INTEGER NOT NULL DEFAULT 0,
    "wishlistAdds" INTEGER NOT NULL DEFAULT 0,
    "wishlistRemoves" INTEGER NOT NULL DEFAULT 0,
    "cartAdds" INTEGER NOT NULL DEFAULT 0,
    "cartRemoves" INTEGER NOT NULL DEFAULT 0,
    "checkoutStarted" INTEGER NOT NULL DEFAULT 0,
    "paymentStarted" INTEGER NOT NULL DEFAULT 0,
    "paymentFailed" INTEGER NOT NULL DEFAULT 0,
    "paymentSuccess" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3),
    "lastProductViewAt" TIMESTAMP(3),
    "lastPurchaseAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_behavior_summary_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "user_events" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "sessionId" TEXT,
    "event" "UserEventType" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_interests" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "UserInterestType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "cartCount" INTEGER NOT NULL DEFAULT 0,
    "purchaseCount" INTEGER NOT NULL DEFAULT 0,
    "lastInteractionAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_interests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_events_userId_createdAt_idx" ON "user_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_events_event_createdAt_idx" ON "user_events"("event", "createdAt");

-- CreateIndex
CREATE INDEX "user_events_entityType_entityId_idx" ON "user_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "user_events_sessionId_idx" ON "user_events"("sessionId");

-- CreateIndex
CREATE INDEX "user_interests_userId_score_idx" ON "user_interests"("userId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "user_interests_userId_type_entityId_key" ON "user_interests"("userId", "type", "entityId");

-- AddForeignKey
ALTER TABLE "user_behavior_summary" ADD CONSTRAINT "user_behavior_summary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_interests" ADD CONSTRAINT "user_interests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
