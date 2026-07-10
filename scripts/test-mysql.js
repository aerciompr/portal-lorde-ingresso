/**
 * Testa DATABASE_URL no cPanel (mesmo driver que o Prisma usa: mysql2).
 * Uso:
 *   export DATABASE_URL='mysql://...'
 *   node scripts/test-mysql.js
 */
const mysql = require('mysql2/promise');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL vazia. Exporte antes de rodar.');
    process.exit(1);
  }
  // mascara senha no log
  console.log('URL:', url.replace(/:([^:@/]+)@/, ':****@'));

  try {
    const conn = await mysql.createConnection(url);
    const [rows] = await conn.query('SELECT 1 AS ok, DATABASE() AS db');
    console.log('OK:', rows);
    await conn.end();
  } catch (e) {
    console.error('FALHOU:', e.message);
    process.exit(1);
  }
}

main();
