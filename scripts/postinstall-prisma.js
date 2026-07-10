/**
 * Prisma generate resiliente no cPanel (cwd do postinstall pode não ser a raiz do app).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = process.env.INIT_CWD || process.cwd();
const schema = path.join(root, 'prisma', 'schema.prisma');

if (!fs.existsSync(schema)) {
  console.error('[postinstall-prisma] Schema não encontrado em:', schema);
  console.error('[postinstall-prisma] INIT_CWD=', process.env.INIT_CWD, 'cwd=', process.cwd());
  process.exit(1);
}

console.log('[postinstall-prisma] schema:', schema);
execSync(`npx prisma generate --schema="${schema}"`, {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});
