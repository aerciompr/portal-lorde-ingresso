/**
 * Aplica prisma/cpanel-init.sql via mysql2 (sem engine Rust do Prisma).
 *
 *   export DATABASE_URL='mysql://user:pass@localhost/db?socket=/tmp/mysql.sock'
 *   node scripts/db-push-cpanel.js
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const root = process.env.INIT_CWD || process.cwd();
const sqlPath = path.join(root, 'prisma', 'cpanel-init.sql');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith('mysql')) {
    console.error('DATABASE_URL inválida. Exemplo (cPanel, SEM aspas no painel):');
    console.error("  mysql://USER:PASS%40x@localhost/DB?socket=/tmp/mysql.sock");
    process.exit(1);
  }
  if (!fs.existsSync(sqlPath)) {
    console.error('Arquivo não encontrado:', sqlPath);
    process.exit(1);
  }

  let sql = fs.readFileSync(sqlPath, 'utf8');
  // remove comentários de linha
  sql = sql.replace(/^--.*$/gm, '');

  console.log('Conectando (mysql2)...', url.replace(/:([^:@/]+)@/, ':****@'));
  const conn = await mysql.createConnection({
    uri: url,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('OK — tabelas aplicadas (cpanel-init.sql).');
    const [tables] = await conn.query('SHOW TABLES');
    console.log('Tabelas:', tables);
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(1);
});
