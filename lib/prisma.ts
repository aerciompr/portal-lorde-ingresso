import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** Remove aspas que o cPanel às vezes grava no valor da env */
function cleanEnvUrl(raw: string): string {
  return (raw || '').trim().replace(/^['"]+|['"]+$/g, '');
}

/**
 * Converte DATABASE_URL MySQL para config do driver mariadb.
 * Suporta socket do cPanel: ?socket=/tmp/mysql.sock
 */
function mysqlConfigFromUrl(urlStr: string) {
  const cleaned = cleanEnvUrl(urlStr);
  const u = new URL(cleaned);
  const socket = u.searchParams.get('socket') || undefined;
  const database = u.pathname.replace(/^\//, '').split('?')[0];
  const user = decodeURIComponent(u.username || '');
  const password = decodeURIComponent(u.password || '');
  const connectionLimit = Number(process.env.DB_POOL_SIZE || 10) || 10;

  const base = {
    user,
    password,
    database,
    connectionLimit,
    connectTimeout: 30_000,
    acquireTimeout: 30_000,
    // evita hang infinito se o host do serviço EasyPanel sumir
    idleTimeout: 60_000,
  };

  if (socket) {
    return { ...base, socketPath: socket };
  }

  return {
    ...base,
    host: u.hostname || '127.0.0.1',
    port: Number(u.port || 3306),
  };
}

function logDbTarget(url: string) {
  try {
    const u = new URL(cleanEnvUrl(url));
    console.log('[prisma] DATABASE target', {
      host: u.hostname,
      port: u.port || '3306',
      database: u.pathname.replace(/^\//, '').split('?')[0],
      user: decodeURIComponent(u.username || ''),
      socket: u.searchParams.get('socket') || null,
    });
  } catch {
    console.log('[prisma] DATABASE_URL presente mas inválida para parse');
  }
}

function createPrismaClient(): PrismaClient {
  const url = cleanEnvUrl(process.env.DATABASE_URL || '');
  if (url) logDbTarget(url);

  /**
   * Adapter MariaDB (JS): só quando forçado ou socket cPanel.
   * No EasyPanel/Docker o engine nativo Prisma+MySQL é mais estável
   * (evita pool timeout active=0 do driver mariadb sob rede Docker).
   *
   * Forçar adapter: PRISMA_USE_ADAPTER=1
   * Forçar nativo:  PRISMA_USE_ADAPTER=0 (default no Docker)
   */
  const forceAdapter = process.env.PRISMA_USE_ADAPTER === '1';
  const forceNative = process.env.PRISMA_USE_ADAPTER === '0';
  const useAdapter =
    !forceNative &&
    (forceAdapter || url.includes('socket='));

  if (useAdapter && url.startsWith('mysql')) {
    try {
      console.log('[prisma] using MariaDB JS adapter');
      const adapter = new PrismaMariaDb(mysqlConfigFromUrl(url));
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      });
    } catch (e) {
      console.error('[prisma] falha ao criar adapter MariaDB:', e);
      throw e;
    }
  }

  console.log('[prisma] using native Prisma engine');
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

let prisma: PrismaClient;

try {
  prisma = globalForPrisma.prisma ?? createPrismaClient();
  // reutilizar em dev e prod (evita múltiplos pools no mesmo processo)
  globalForPrisma.prisma = prisma;
} catch (e) {
  console.error('Prisma init error:', e);
  prisma = {} as PrismaClient;
}

export { prisma };
