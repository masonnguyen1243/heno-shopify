import db from "../db.server";
import { Prisma } from "@prisma/client";

export async function insertIdempotencyRecord(params: {
  idempotencyKey: string;
  topic: string;
  shopDomain: string;
}): Promise<"inserted" | "duplicate"> {
  const { idempotencyKey, topic, shopDomain } = params;
  try {
    await db.processedWebhook.create({
      data: { idempotencyKey, topic, shopDomain, status: "PENDING" },
    });
    return "inserted";
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return "duplicate";
    }
    throw error;
  }
}

export async function updateIdempotencyStatus(
  idempotencyKey: string,
  status: "COMPLETED" | "FAILED" | "AWAITING_MARK_PAID"
): Promise<void> {
  await db.processedWebhook.update({
    where: { idempotencyKey },
    data: { status },
  });
}
