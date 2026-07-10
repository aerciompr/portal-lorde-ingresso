import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Converte DATABASE_URL MySQL para config do driver mariadb/mysql2.
 * Suporta socket do cPanel: ?socket=/tmp/mysql.sock
 * (O engine Rust do Prisma falha no CageFS; o adapter JS funciona.)
 */
function mysqlConfigFromUrl(urlStr: string) {
  const u = new URL(urlStr);
  const socket = u.searchParams.get('socket') || undefined;
  const database = u.pathname.replace(/^\//, '').split('?')[0];
  const user = decodeURIComponent(u.username || '');
  const password = decodeURIComponent(u.password || '');

  if (socket) {
    return {
      socketPath: socket,
      user,
      password,
      database,
      connectionLimit: 5,
    };
  }

  return {
    host: u.hostname || '127.0.0.1',
    port: Number(u.port || 3306),
    user,
    password,
    database,
    connectionLimit: 5,
  };
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL || '';
  const useAdapter =
    process.env.PRISMA_USE_ADAPTER === '1' ||
    url.includes('socket=') ||
    process.env.NODE_ENV === 'production';

  if (useAdapter && url.startsWith('mysql')) {
    const adapter = new PrismaMariaDb(mysqlConfigFromUrl(url));
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

let prisma: PrismaClient;

try {
  prisma = globalForPrisma.prisma ?? createPrismaClient();
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
} catch (e) {
  console.error('Prisma init error:', e);
  prisma = {} as PrismaClient;
}

export { prisma };
