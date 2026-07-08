-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ProcessedWebhookStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'AWAITING_MARK_PAID');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalled_at" TIMESTAMP(3),

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_credentials" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "encrypted_client_id" TEXT NOT NULL,
    "encrypted_secret_token" TEXT NOT NULL,
    "account_number" TEXT,
    "va_account_number" TEXT,
    "bank_bin" TEXT,
    "bank_name" TEXT,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL DEFAULT '',
    "shop_domain" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "qr_image_url" TEXT,
    "deeplink_url" TEXT,
    "amount" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_webhooks" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "ProcessedWebhookStatus" NOT NULL DEFAULT 'PENDING',
    "topic" TEXT NOT NULL,
    "shop_domain" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" TEXT,

    CONSTRAINT "processed_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_shop_domain_key" ON "merchants"("shop_domain");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_credentials_merchant_id_key" ON "merchant_credentials"("merchant_id");

-- CreateIndex
CREATE INDEX "payments_shop_domain_order_id_idx" ON "payments"("shop_domain", "order_id");

-- CreateIndex
CREATE INDEX "payments_shop_domain_order_number_idx" ON "payments"("shop_domain", "order_number");

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhooks_idempotency_key_key" ON "processed_webhooks"("idempotency_key");

-- CreateIndex
CREATE INDEX "processed_webhooks_shop_domain_topic_idx" ON "processed_webhooks"("shop_domain", "topic");

-- CreateIndex
CREATE INDEX "processed_webhooks_processed_at_idx" ON "processed_webhooks"("processed_at");

-- AddForeignKey
ALTER TABLE "merchant_credentials" ADD CONSTRAINT "merchant_credentials_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

