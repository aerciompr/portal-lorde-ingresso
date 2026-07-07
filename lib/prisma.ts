import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prisma: PrismaClient;

try {
  prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
} catch (e) {
  console.error('Prisma init error (check MySQL running and versions):', e);
  // Fallback stub to prevent full crash during dev
  prisma = {} as any;
}

export { prisma };
