/**
 * Aplica o schema Prisma no MySQL via driver JS (mysql2),
 * sem usar o engine Rust do `prisma db push` (quebra no cPanel/CageFS).
 *
 * Uso (virtualenv Node ativo):
 *   export DATABASE_URL='mysql://user:pass@localhost/db?socket=/tmp/mysql.sock'
 *   node scripts/db-push-cpanel.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const root = process.env.INIT_CWD || process.cwd();
const schemaPath = path.join(root, 'prisma', 'schema.prisma');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Defina DATABASE_URL antes (com ?socket=/tmp/mysql.sock se for cPanel).');
    process.exit(1);
  }
  if (!fs.existsSync(schemaPath)) {
    console.error('Schema não encontrado:', schemaPath);
    process.exit(1);
  }

  console.log('Gerando SQL a partir do schema (sem conectar no engine)...');
  const sql = execSync(
    `npx prisma migrate diff --from-empty --to-schema-datamodel "${schemaPath}" --script`,
    { encoding: 'utf8', cwd: root, env: process.env }
  );

  if (!sql.trim()) {
    console.log('Nenhum SQL gerado.');
    return;
  }

  const outFile = path.join(root, 'prisma', 'cpanel-schema.sql');
  fs.writeFileSync(outFile, sql, 'utf8');
  console.log('SQL salvo em', outFile);

  console.log('Conectando com mysql2...');
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  console.log('Conectado. Aplicando statements...');

  // Divide por ; no fim de linha (simplificado)
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  let ok = 0;
  let skip = 0;
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
      ok++;
    } catch (e) {
      // tabela já existe, etc.
      if (e && (e.code === 'ER_TABLE_EXISTS_ERROR' || e.errno === 1050)) {
        skip++;
        continue;
      }
      console.error('Erro no statement:', stmt.slice(0, 120) + '...');
      console.error(e.message);
      await conn.end();
      process.exit(1);
    }
  }

  await conn.end();
  console.log(`Pronto. OK=${ok} já_existiam=${skip}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
