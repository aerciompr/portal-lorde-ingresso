# Build no cPanel falha com EAGAIN — o que fazer

## Sintoma
```
spawn .../node EAGAIN
errno: -11
jest-worker / processChild.js
```

A conta compartilhada **não deixa criar mais processos**. O `next build` tenta spawnar worker e morre.

## Banco e Prisma (já ok no seu caso)
- Tabelas: `node scripts/db-push-cpanel.js`
- Client: `npx prisma generate --schema=...`

## Caminho A — tentar build no servidor (leve)

```bash
cd ~/repositories/portal-lorde-ingresso
git pull origin main

# feche outras sessões SSH / terminais Node
export UV_THREADPOOL_SIZE=1
export NODE_OPTIONS='--max-old-space-size=512'
export NEXT_TELEMETRY_DISABLED=1
export CI=1

npx next build --webpack
```

Se ainda der EAGAIN → use caminho B.

## Caminho B — build no GitHub (recomendado)

1. Abra: https://github.com/aerciompr/portal-lorde-ingresso/actions  
2. Workflow **Build production (Linux)** → **Run workflow**  
3. Ao terminar → baixe o artifact **next-build** (`next-build.tgz`)  
4. No cPanel File Manager (ou SCP), envie para:
   `~/repositories/portal-lorde-ingresso/next-build.tgz`
5. No SSH:

```bash
cd ~/repositories/portal-lorde-ingresso
tar -xzf next-build.tgz
# deve existir pasta .next/
ls -la .next
```

6. **Setup Node.js App → Restart**

O app usa `server.js` + `.next` já compilado — **não precisa** `npm run build` no servidor.

## Atualizar o site depois
1. `git pull` no servidor (código + package.json)  
2. `npm install` se mudou dependências  
3. `npx prisma generate --schema=...`  
4. Novo build no GitHub Actions → baixar `.next` de novo  
5. Restart  

## DATABASE_URL no painel (sem aspas)
```text
mysql://lord9962_portal:SENHA_URLENCODED@localhost/lord9962_portal?socket=/tmp/mysql.sock
```
