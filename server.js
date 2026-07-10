/**
 * Entrada de produção para cPanel / Passenger / Node.js Selector.
 * Uso: NODE_ENV=production node server.js
 * (a porta vem de process.env.PORT definida pelo cPanel)
 */
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '127.0.0.1';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('[server] error', req.url, err);
        res.statusCode = 500;
        res.end('Erro interno');
      }
    }).listen(port, hostname, () => {
      console.log(`[server] ready http://${hostname}:${port} (${dev ? 'dev' : 'prod'})`);
    });
  })
  .catch((err) => {
    console.error('[server] failed to start', err);
    process.exit(1);
  });
