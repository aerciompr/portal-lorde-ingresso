# Contribuindo — Portal Lorde Nelson Ingressos

## Fluxo

1. Trabalhe em `main` (ou branch curta) no path  
   `C:\Users\aerciompr\projects\lordenelson-ingressos`
2. Antes de commitar:
   ```bash
   npm test
   npm run typecheck   # pode haver erros legados; testes são o gate principal
   ```
3. `git push origin main`
4. Aguarde Actions **Docker image (GHCR)** e **CI** verdes
5. EasyPanel → **Implantar** (pull `ghcr.io/aerciompr/portal-lorde-ingresso:main`)

## O que não fazer

- Commitar `.env`, secrets, `dist-cpanel/`
- `prisma/seed` em production sem `ALLOW_SEED=1`
- Build no VPS (Source GitHub+Dockerfile) — use GHCR
- Apagar tokens MP/Stripe do banco

## Docs

- `docs/HANDOFF_COMPLETO.md` — estado e operação
- `docs/ARCHITECTURE.md` — arquitetura
- Plano mestre de melhorias — fases A–D no histórico de sessão

## Testes

```bash
npm test                 # vitest unitários (lib/*)
npm run test:watch
```

Cobertura atual: settings públicos, métricas de pedidos (bruto ≠ estorno), períodos.
