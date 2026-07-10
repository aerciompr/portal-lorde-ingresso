# AGENTS.md — Lorde Nelson Ingressos

Instruções para **agentes de IA** e devs que trabalham neste repositório.

## Identidade

| | |
|--|--|
| Projeto | Portal de ingressos Lorde Nelson |
| Path oficial | `C:\Users\aerciompr\projects\lordenelson-ingressos` |
| GitHub | `aerciompr/portal-lorde-ingresso` · branch `main` |
| Produção | `https://portal.lordenelson.com.br` · EasyPanel · VPS `151.243.33.241` |

Se o workspace do IDE abrir em `C:\Windows\System32` ou outro path, **sempre editar o path oficial acima**.

## Documentação obrigatória antes de mudanças grandes

1. [`docs/HANDOFF_COMPLETO.md`](./docs/HANDOFF_COMPLETO.md) — estado real e armadilhas  
2. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — fluxos e modelos  
3. [`docs/DEPLOY_EASYPANEL.md`](./docs/DEPLOY_EASYPANEL.md) — se tocar deploy  
4. [`docs/README.md`](./docs/README.md) — índice  

## Idioma

- Comunicação com o usuário: **português brasileiro (pt-BR)**  
- Código e identificadores: inglês OK; UI e mensagens de API em pt-BR  

## Regras de segurança

- **Não** commitar `.env`, chaves, tokens, `*.db`, dumps, `dist-cpanel/`  
- Não logar secrets em docs ou commits  
- Não expor `ADMIN_PASSWORD` / tokens em issues ou prints commitados  

## Stack (não regredir)

- Next.js 16 App Router + TypeScript  
- Prisma **MySQL** (`provider = "mysql"`) — não voltar SQLite em prod sem decisão explícita  
- Node **≥ 20.9** (Docker: 22)  
- Entrada de processo: `server.js` com `HOST=0.0.0.0`  
- Deploy preferido: **Dockerfile** no EasyPanel (evitar Nixpacks Node 18)  

## Arquivos sensíveis (ler antes de editar)

- `lib/finalize-paid-order.ts` — pagamento confirmado  
- `lib/lote-virada.ts` — lotes  
- `lib/prisma.ts` — conexão DB  
- `lib/settings.ts` — env + DB settings  
- `Dockerfile` / `server.js` — produção  
- `prisma/schema.prisma` — exige `db push` em prod após mudança  

## Workflow preferido

1. Ler handoff + docs relevantes  
2. Mudanças pequenas e verificáveis  
3. `npm run typecheck` / `npm run build` quando o escopo afetar build  
4. Commit claro; push `main` se o usuário pedir  
5. Lembrar: EasyPanel precisa **Redeploy**; schema → `npx prisma db push --schema=./prisma/schema.prisma` no container  

## O que não reabrir sem pedido explícito

- Deploy em **cPanel shared** (histórico de EAGAIN / CageFS)  
- Reescrita completa da stack  
- Trocar MySQL por outro DB sem migração planejada  

## Skills Grok (se disponíveis em `.grok/skills/`)

| Skill | Quando |
|-------|--------|
| `nextjs-fullstack` | Rotas App Router, API, auth, cache |
| `frontend-ux-engineer` | UI, formulários, a11y |
| `security-audit` | Auth, secrets, webhooks |
| `repo-health-check` | Auditoria antes de PRs grandes |
| `git-github-flow` | Commits/PRs |
| `performance-optimizer` | Latência / queries |

## Qualidade

- Preços em **centavos** no backend  
- BRL na UI via `lib/utils.ts`  
- Preferir rotas dinâmicas quando usam Prisma em request  
- Após deploy: validar home, admin login, e se possível um pagamento teste  

## Atualizar o handoff

Se o estado de produção mudar de forma material (novo host, schema breaking, feature de pagamento), atualize `docs/HANDOFF_COMPLETO.md` na mesma PR/commit.
