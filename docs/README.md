# Documentação — Portal Lorde Nelson Ingressos

Índice oficial para humanos e IAs. **Comece por aqui** se for continuar o projeto.

| Prioridade | Documento | Para quê |
|------------|-----------|----------|
| **1** | [`HANDOFF_COMPLETO.md`](./HANDOFF_COMPLETO.md) | **Estado real (2026-07-11)**: produção, segurança, checklist novo DEV ~1h, armadilhas |
| **2** | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, modelos Prisma, fluxos de pagamento, mapa de pastas/APIs |
| **3** | [`UPLOADS_PERSISTENTES.md`](./UPLOADS_PERSISTENTES.md) | Imagens que não somem no deploy (volume EasyPanel) |
| **4** | [`DEPLOY_EASYPANEL.md`](./DEPLOY_EASYPANEL.md) | Deploy EasyPanel (oficial) |
| **5** | [`DEPLOY_RAPIDO.md`](./DEPLOY_RAPIDO.md) | Deploy rápido (imagem GHCR, opcional) |
| **6** | [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md) | Checklist go-live operacional |
| **7** | [`../PRODUCTION_SETUP.md`](../PRODUCTION_SETUP.md) | Gateways, webhooks, crons, segredos |
| — | [`.env.example`](../.env.example) | Template de variáveis (nunca commitar `.env`) |
| — | [`SESSION_HANDOFF.md`](./SESSION_HANDOFF.md) | Handoff técnico antigo (pré-VPS) |
| — | [`DEPLOY_SUBDOMAIN.md`](./DEPLOY_SUBDOMAIN.md) | Deploy genérico subdomínio |
| — | [`DEPLOY_CPANEL.md`](./DEPLOY_CPANEL.md) | cPanel (**legado** — não usar se EasyPanel funciona) |
| — | [`BUILD_CPANEL_EAGAIN.md`](./BUILD_CPANEL_EAGAIN.md) | Histórico EAGAIN shared host |

## Planos e benchmarks (histórico — não são o estado atual)

| Documento | Conteúdo |
|-----------|----------|
| `PLANO_*.md` | Planos antigos de implementação |
| `COMPETITOR_BENCHMARK_AND_IMPROVEMENTS.md` | Benchmark Sympla / ingresso.com |
| `SYMPA_INGRESSO_COM_BENCHMARK.md` | Notas de UX concorrentes |

> Para operar ou continuar o código, use **HANDOFF_COMPLETO** + **ARCHITECTURE**. Os `PLANO_*` são arquivo histórico.

## Regras rápidas para IA / DEV

1. **Idioma:** pt-BR com o usuário.  
2. **Repo:** `https://github.com/aerciompr/portal-lorde-ingresso` · `main`.  
3. **Local:** `C:\Users\aerciompr\projects\lordenelson-ingressos`.  
4. **Produção:** EasyPanel · VPS `151.243.33.241` · `https://portal.lordenelson.com.br`.  
5. **Banco:** MySQL (Prisma). Não voltar SQLite em prod.  
6. **Node:** ≥ 20.9 (Docker 22).  
7. **Não commitar:** `.env`, chaves, `*.db`, `dist-cpanel/`, dumps.  
8. **Builder:** Dockerfile (evitar Nixpacks Node 18).  
9. **Secrets MP/Stripe:** ficam no banco/env; API pública **não** os devolve.  
10. Ler `HANDOFF_COMPLETO.md` antes de mexer em pagamentos, auth, deploy ou Prisma.
