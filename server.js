/**
 * Entrada de produção para cPanel / Passenger / Node.js Selector.
 *
 * NÃO use process.env.HOSTNAME (no Linux isso é o nome da máquina, ex. us162-cp).
 * O painel define PORT; o proxy do cPanel encaminha para 127.0.0.1:PORT.
 */
const { createServer } = require('http');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
// Bind em todas as interfaces locais — cPanel/Passenger precisa disso
const host = process.env.HOST || '0.0.0.0';

// Diagnóstico no stderr do cPanel
console.log('[server] starting', {
  node: process.version,
  cwd: process.cwd(),
  port,
  host,
  nodeEnv: process.env.NODE_ENV,
  hasDb: Boolean(process.env.DATABASE_URL),
  hasTicketSecret: Boolean(process.env.TICKET_SECRET),
  nextDir: fs.existsSync(path.join(process.cwd(), '.next')),
});

if (!dev && !fs.existsSync(path.join(process.cwd(), '.next'))) {
  console.error('[server] ERRO: pasta .next não existe. Envie o next-build.tgz e extraia (tar -xzf next-build.tgz).');
  process.exit(1);
}

const app = next({ dev, dir: process.cwd() });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('[server] request error', req.url, err);
        res.statusCode = 500;
        res.end('Erro interno');
      }
    });

    // Passenger (alguns hosts)
    if (typeof PhusionPassenger !== 'undefined') {
      // eslint-disable-next-line no-undef
      PhusionPassenger.configure({ autoInstall: false });
      server.listen('passenger', () => {
        console.log('[server] ready via PhusionPassenger');
      });
      return;
    }

    server.listen(port, host, () => {
      console.log(`[server] ready on http://${host}:${port}`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to start', err);
    process.exit(1);
  });
