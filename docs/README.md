# Documentação — Portal Lorde Nelson Ingressos

Índice oficial para humanos e IAs. **Comece por aqui** se for continuar o projeto.

| Prioridade | Documento | Para quê |
|------------|-----------|----------|
| **1** | [`HANDOFF_COMPLETO.md`](./HANDOFF_COMPLETO.md) | **Estado real do projeto (2026-07-10)**: o que está feito, produção, armadilhas, próximos passos |
| **2** | [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, modelos Prisma, fluxos de pagamento, map de pastas/APIs |
| **3** | [`DEPLOY_RAPIDO.md`](./DEPLOY_RAPIDO.md) | **Deploy rápido**: imagem GHCR (sem build no VPS) |
| **4** | [`DEPLOY_EASYPANEL.md`](./DEPLOY_EASYPANEL.md) | Deploy EasyPanel (Git/Dockerfile ou imagem) |
| **5** | [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md) | Checklist go-live operacional |
| **6** | [`../PRODUCTION_SETUP.md`](../PRODUCTION_SETUP.md) | Gateways, webhooks, crons, segredos |
| — | [`.env.example`](../.env.example) | Template de variáveis (nunca commitar `.env`) |
| — | [`SESSION_HANDOFF.md`](./SESSION_HANDOFF.md) | Handoff técnico da sessão de features (pré-VPS) |
| — | [`DEPLOY_SUBDOMAIN.md`](./DEPLOY_SUBDOMAIN.md) | Deploy genérico subdomínio (Vercel/VPS) |
| — | [`DEPLOY_CPANEL.md`](./DEPLOY_CPANEL.md) | cPanel (legado — **não usar** se EasyPanel funciona) |
| — | [`BUILD_CPANEL_EAGAIN.md`](./BUILD_CPANEL_EAGAIN.md) | Histórico: build EAGAIN no shared host |

## Planos e benchmarks (histórico de produto)

| Documento | Conteúdo |
|-----------|----------|
| `PLANO_*.md` | Planos de implementação (evolução de produto) |
| `COMPETITOR_BENCHMARK_AND_IMPROVEMENTS.md` | Benchmark Sympla / ingresso.com |
| `SYMPA_INGRESSO_COM_BENCHMARK.md` | Notas de UX concorrentes |

## Regras rápidas para IA / DEV

1. **Idioma:** pt-BR com o usuário.
2. **Repo GitHub:** `https://github.com/aerciompr/portal-lorde-ingresso` (público, branch `main`).
3. **Projeto local:** `C:\Users\aerciompr\projects\lordenelson-ingressos`
4. **Produção:** EasyPanel no VPS `151.243.33.241` — domínio `https://portal.lordenelson.com.br`
5. **Banco:** MySQL (Prisma `provider = "mysql"`). **Não** é mais SQLite em prod.
6. **Node:** ≥ 20.9 (preferir 22). Dockerfile usa `node:22-bookworm-slim`.
7. **Não commitar:** `.env`, chaves, `*.db`, `dist-cpanel/`, dumps.
8. **Builder EasyPanel:** preferir **Dockerfile** (Nixpacks Node 18 quebra o Next 16).
9. Ler `HANDOFF_COMPLETO.md` antes de mudar pagamentos, lotes, deploy ou Prisma.
