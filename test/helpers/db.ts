import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

export async function setupTestDatabase(): Promise<PrismaClient> {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();

  const databaseUrl = container.getConnectionUri();
  process.env.DATABASE_URL = databaseUrl;

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$connect();

  return prisma;
}

export async function teardownTestDatabase(): Promise<void> {
  await prisma?.$disconnect();
  await container?.stop();
}

export async function cleanDatabase(client: PrismaClient): Promise<void> {
  await client.$transaction([
    client.processedWebhook.deleteMany(),
    client.payment.deleteMany(),
    client.merchantCredential.deleteMany(),
    client.merchant.deleteMany(),
    client.session.deleteMany(),
  ]);
}
