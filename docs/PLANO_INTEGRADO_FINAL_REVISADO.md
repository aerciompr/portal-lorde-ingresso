# PLANO INTEGRADO FINAL REVISADO - Lorde Nelson Ingressos (Next.js + MySQL)

**Data:** 2026-06-18  
**Versão:** Revisado após estudo completo de Sympla + Ingresso.com + requisitos específicos enviados pelo usuário (pub Maceió) + associações ao que foi levantado em revisões anteriores (segurança, cancelamentos 100%, relatórios, UX líderes).

## 1. Entendimento Completo: O que foi Enviado + O que Levantei

### Requisitos do Pub (enviados diretamente):
- **Sem meia-entrada**: Todos ingressos 18+. (Sem tipos "meia". Simplifica vs Sympla/Ingresso.)
- **1 único local**: Eventos exclusivamente no restaurante do pub (Rua Silvério Jorge, 241, Jaraguá, Maceió-AL). Sem multi-venue.
- **Virada de lotes** (core):
  - Preços sobem de X em X (ex: lote promo R$25 → próximo R$30).
  - Automática ao esgotar o lote atual (sold >= totalQty).
  - Manual no admin: informar quantidade + possibilidade de alterar valor da virada.
  - Campos: loteAcrescimoCents por evento, viradaAutomatica por lote, ordem, ativo.
- **Admin completo**:
  - Dashboard gerencial.
  - CRUD eventos + lotes.
- **Relatórios gerenciais detalhados por lotes**:
  - Por evento/lote: bruto (grossCents), líquido (netCents = bruto - taxas).
  - Taxas: % + valor fixo em centavos por transação (diferente por gateway: Pix vs Cartão).
  - Detalhamento completo de estornos/refunds.
  - Mini BI: cards totais + gráficos (barras por lote, linhas tempo, pizza gateway).
- **Autenticação**:
  - Cliente: CPF ou email + senha (login persistente). Código de acesso (accessCode) como fallback/guest.
  - Admin: email + senha (seguro).
- **Cancelamentos 100%**:
  - Reais via Stripe (refunds.create) e Mercado Pago (PaymentRefund.create) + webhooks.
  - Regras por evento (horas antes + % taxa) + alinhamento CDC.
  - Atualização financeira e relatórios.

### Estudo de Sympla (sympla.com.br) + Ingresso.com (o que levantei + pesquisei):
**Sympla (principais fluxos/políticas):**
- Descoberta + página evento com lotes (virada automática de preço para urgência).
- Tipos simples + seleção qty.
- Dados comprador: nome, email, CPF (obrigatório comum), telefone.
- Login/conta: email + senha, Google, código SMS/WhatsApp. "Meus Ingressos" / app Sympla (carteira offline).
- Pagamento: Cartão (parcelamento), Pix, boleto. Transparent checkout.
- Confirmação: PDF/QR email + app imediato.
- Cancelamento (ajuda.sympla.com.br): 
  - 7 dias corridos após compra (CDC).
  - + até 48h antes do início do evento (dentro do prazo 7 dias).
  - Reembolso: automático em muitos casos (Pix até 7 dias); produtor pode definir + reter taxa de serviço em alguns cenários.
  - Sem reembolso parcial em alguns casos (cancela pedido inteiro).
  - Repasse produtor: ~3 dias úteis após evento.
- Taxas produtor ~10% presenciais.
- Relatórios para produtor: vendas, lotes, financeiro.

**Ingresso.com:**
- Fluxo similar: descoberta por sessões/cinemas, seleção (assentos em alguns), qty/tipos (inteira/meia).
- CPF enfatizado (meia).
- Conta + "Meus Pedidos".
- Pagamento cartão/Pix/boleto.
- Cancel: CDC 7 dias (se sessão distante), limite ~4x/mês por usuário. Reembolso mesmo método (cartão 10d úteis). Taxa conveniência pode ser questionada (Procon integral em alguns).
- Regras por parceiro/produtor.

**Gaps identificados vs líderes + sugestões aplicadas:**
- Lotes/virada: agora implementado no schema + virada manual + lógica para auto.
- Auth cliente: CPF/email + senha + persist + fallback código (melhor que só código).
- Políticas claras: precisa página dedicada /politica exibindo CDC 7d + regras pub (sem meia).
- Reembolsos reais: em progresso (APIs + webhooks).
- Relatórios por lote + BI: iniciado (agrupamento gross/net/refunds, cards + BarChart).
- Imagens/UX: remover picsum, banners em main + ingressos.
- Checkout guest-friendly mantido (email+CPF) + opção senha.
- Sem app nativo por ora (PWA possível futuro).
- Segurança: TICKET_SECRET HMAC obrigatório, bcrypt, timing safe para admin.

**Adaptações para o Pub:**
- Sem meia, sem multi local, sem addons store por ora.
- Foco restaurante/pub: experiência simples, 18+, lotes para criar urgência em eventos presenciais.
- Relatórios com fees configuráveis (% + centavos fixos por gateway).

### Associação Direta (enviado + levantado + status atual):
Todos os pontos acima foram associados ao código atual (schema MySQL com Lote + Order.gross/net/fee/loteId/buyerPasswordHash + Cancellation, ingressos com lookup password, admin com lotes display + virar, reports por lote, webhooks + refund routes reais, etc.).

**Status Atual (jun/2026):**
- Schema: completo (Lote, financials, password, lotes por event + activeLoteId/acrescimo).
- Lotes: virada manual (/api/admin/lotes/virar + UI admin). Preço do activeLote usado em seletor/checkout.
- Autenticação: /ingressos suporta email/cpf + senha OU código; set-password; localStorage persist; admin email+pass (melhorado).
- Pagamentos: Stripe Elements + MP Pix transparent; gross/net/fee calculados no pay + webhooks; accessCode gerado 1x.
- Cancel: request + validação regras; admin refund chama APIs reais (Stripe/MP); webhooks tratam charge.refunded/payment.refunded; atualiza order/ticket/CancellationRequest + email.
- Relatórios: /admin/reports com cards bruto/líquido/estornos/tickets + agrupamento por lote + BarChart bruto. Base para mini BI.
- DB: MySQL local root@3306/lordenelson_ingressos (prisma db push ok).
- .env: com chaves live + TICKET_SECRET forte + MySQL (cuidado alto - nunca commit).
- Build/lint: limpos (0 erros recentes).
- App roda: localhost:3000 funcional.
- Docs existentes: este novo + PLANO_FINAL_INTEGRADO.md + SYMPA_INGRESSO_COM_BENCHMARK.md + PRODUCTION_SETUP.md + .env.example (atualizado MySQL + placeholders).

**Pendentes chave (para 100%):**
- Virada automática completa (após pagamento confirmado + esgotado).
- Refinamentos reports (filtros, export CSV, mais gráficos BI, drilldown por lote).
- Página /politica-de-cancelamento clara (CDC + regras pub).
- Substituir imagens demo (picsum etc).
- Testes E2E manuais completos com live keys (valores pequenos!).
- Deploy: MySQL hospedado + Vercel + webhooks reais + env vars.
- Segurança/polimento: Zod, rate limit login, next/image, remover remnants isolados.

## 2. Princípios do Plano
- 100% funcional e alinhado docs oficiais Stripe/MP + CDC + fluxos Sympla/Ingresso adaptados.
- Gradual por fases + teste completo após cada (compra → virada → acesso senha/código → cancel → relatório BI).
- Guest + login real para cliente.
- Lotes/virada exatos como descrito.
- Financeiro e relatórios reais (bruto/líquido/estornos).
- Segurança alta (sem fallbacks fracos, secrets obrigatórios).
- Limpar tudo de teste/demo para prod.
- Documentar e rodar comandos (npm run build, prisma, dev).

## 3. Planejamento por Fases (Ordem Recomendada)

### Fase 0: Limpeza + Base + Configs no Banco (Imediato - em andamento)
1. .env limpo: **Apenas segredos reais** ficam aqui (DATABASE_URL, STRIPE_SECRET_KEY, MP_ACCESS_TOKEN, TICKET_SECRET, RESEND, ADMIN_PASSWORD). Nunca commit.
2. Configs não-secretas (taxas de gateway % + centavos fixos, from_email, cancel defaults) **movidas para o banco** via tabela Setting + helper `lib/settings.ts`. 
   - Persistência: não perdem em deploy.
   - Segurança: admin edita pelo painel (sem tocar .env). Segredos continuam só em env vars.
3. Atualizados: pay/route, stripe/mp webhooks usam `getFeeForMethod()` do DB.
4. Admin UI melhorado com seção clara "Taxas de Gateway (Pix + Cartão)".
5. Seeding automático de defaults na primeira visita ao /admin/settings.
6. .env.example + PRODUCTION_SETUP atualizados com nota.
7. Rode `npx prisma generate`, `npm run dev`, acesse /admin → preencha/salve taxas → faça uma compra teste para ver bruto/líquido usando os valores do banco.

**Teste:** npm run dev; build limpo.

### Fase 1: Autenticação Cliente + Admin 100% (1 dia)
- Cliente: Login principal CPF/Email + Senha em /ingressos (já parcial). Após código, oferecer definir senha.
- Fallback código mantido.
- API: lookup + set-password com hash bcrypt.
- Persist: localStorage + session client.
- Admin: /admin/login com email + senha (já em api com safe compare). Cookie httpOnly + expiração.
- Opcional: rate limit básico login.
- Teste: comprar → acessar com código → definir senha → logout → login senha → fallback código.

**Entregável:** Login como especificado.

### Fase 2: Lotes Virada Automática + Manual Completa (1-2 dias)
- Lógica virada: após sucesso pagamento (pay route + webhook paid), checar se lote esgotado + viradaAutomatica → criar próximo (preco = atual + acrescimoCents; totalQty = default; nome sequencial; marcar anterior inativo, set activeLoteId).
- Manual admin: já existe form (qtd + preço opcional) → chama virar.
- UI: mostrar lote atual/preço no evento page + TicketSelector + checkout.
- Criar lote inicial ao criar evento.
- Teste: criar evento com lote promo + acrescimo. Comprar até esgotar → virada auto (ver DB + UI). Manual com valor diferente.

**Entregável:** Virada exata conforme enviado.

### Fase 3: Financeiro + Relatórios por Lotes + Mini BI Avançado (2 dias)
- No create/pay/webhook: sempre set grossCents/net/feeCents/feeDetails usando Settings (ou defaults por gateway).
- Settings: adicionar chaves como "pix_fee_percent", "pix_fee_fixed_cents", "card_fee_percent"...
- Reports (/admin/reports):
  - Filtros (evento, data, gateway).
  - Tabela detalhada (pedido, lote, data, gateway, bruto, taxa, líquido, status).
  - Estornos: lista + soma por lote.
  - Mini BI: mais charts Recharts (linha vendas tempo por lote; pizza % gateway; total líquido).
  - Export: CSV simples (botão).
  - Drill: clique lote → lista pedidos daquele lote.
- Dashboard admin: visão rápida (lotes quase cheios, últimos estornos).
- Teste: comprar Pix + Cartão → ver diferença líquido. Cancelar → estorno aparece no relatório por lote.

**Entregável:** Relatórios exatamente como descrito (bruto/líquido/estornos/mini BI).

### Fase 4: Cancelamento 100% Real (Docs Stripe + MP) (1-2 dias)
- Validar regras no client (horas antes + taxa).
- Request cria pending.
- Admin lista + aprovar: calcular refund amount (considerar taxa ou full conforme regra pub).
- Chamar real:
  - Stripe: refunds.create({payment_intent, amount})
  - MP: PaymentRefund.create com amount.
- Update order status refunded, tickets cancelled, CancellationRequest approved + amount.
- Webhooks: charge.refunded / payment.refunded → update idempotente.
- Email: aprovado com valor real.
- UI: mostrar política em evento/checkout/ingressos.
- Teste: solicitar cancel elegível → aprovar admin → verificar Stripe/MP dashboard refund + email + relatório atualizado (estorno aparece).

**Entregável:** Cancel 100% funcional por docs oficiais.

### Fase 5: Polimento + Políticas + Imagens + Segurança (paralelo)
- Criar app/politica-de-cancelamento/page.tsx com texto claro (7 dias CDC + 48h/24h pub + 18+ + taxas + 1 local).
- Linkar em footer, evento, checkout, ingressos.
- Imagens reais: banners home + ingressos; imageUrl eventos.
- Remover qualquer simulado (guardar só se !keys).
- next/image + remotePatterns.
- Zod para validações críticas (checkout, forms).
- Melhorias checkout: mostrar política + resumo taxas + CPF mask.
- Testes E2E manuais happy + edge (virada concorrente, refund parcial, senha errada).

### Fase 6: Deploy Produção
- MySQL hospedado (Railway/Aiven recomendado).
- Vercel: todas env vars (NUNCA .env no git).
- Config webhooks Stripe/MP com domínio real.
- Prisma push + migrate.
- Testes com valores reais pequenos.
- Monitor (logs webhooks, refunds).
- Atualizar docs finais + README.

**Pós-deploy:** Verificar tudo + backup.

## 4. Ordem de Execução + Verificação
1. Fase 0 + 1 (auth + limpeza).
2. Fase 2 (lotes).
3. Fase 3 (reports).
4. Fase 4 (cancel real).
5. Fase 5 (polish).
6. Fase 6 (deploy).

**Após cada fase obrigatoriamente:**
- `npm run dev` (ou bg) + fluxo completo manual.
- `npm run build`
- `npx prisma db push`
- Teste cancel + relatório + senha.
- Commit docs atualizados.

## 5. Riscos + Avisos Críticos
- Chaves live: teste só com R$1-10. Monitore dashboards.
- Virada concorrente: use transações ou lock simples.
- Reembolsos reais: irreversíveis.
- MySQL local ok agora; hospedado antes prod.
- Sem commit .env.
- Política CDC: exibir sempre para evitar problemas.

## 6. Arquivos Chave Referência
- prisma/schema.prisma (Lote + Order finance + auth)
- app/ingressos/page.tsx (login senha/código)
- app/admin/page.tsx + reports/page.tsx
- app/api/admin/lotes/virar/route.ts , refund/route.ts
- app/api/orders/pay/route.ts , webhooks
- lib/validate-ticket.ts (HMAC)
- lib/auth.ts
- PRODUCTION_SETUP.md
- docs/SYMPA_INGRESSO_COM_BENCHMARK.md
- .env.example

## Próximos Passos Imediatos
1. Rode `npm run build` + `npm run dev` para validar estado atual.
2. Comece Fase 0/1 (limpeza + finalizar auth senha).
3. Implemente virada automática.
4. Peça para eu executar a próxima fase específica.

Tudo associado, funcional e alinhado. Pronto para seguir passo a passo.

Se quiser, posso implementar a próxima fase agora (diga qual).
