# Plano Final Integrado - Lorde Nelson Ingressos (Produção)

**Data:** 2026-06-16  
**Contexto:** Após você enviar os requisitos específicos (sem meia-entrada, 1 local/restaurante, virada automática de lotes com acréscimo fixo, manual por qtd + alterar valor, dashboard completo, relatórios por lotes com bruto/líquido/estornos, mini BI, login cliente CPF/email + senha e admin email + senha), associei ao que levantei no benchmark Sympla/Ingresso.com e revisão do sistema (sugestões de segurança, autenticação, cancelamentos 100%, relatórios, etc.), e criei este novo planejamento consolidado.

**Objetivo Geral:** Aplicar TUDO de forma integrada, 100% funcional, passo a passo. Foco em alinhar com Sympla/Ingresso (lotes, relatórios, login, políticas claras), mas adaptado ao pub (1 local, +18, eventos no restaurante).

**Princípios:**
- Guest-friendly, mas com login real para clientes (CPF/email + senha).
- Virada de lotes exatamente como descrito.
- Cancelamentos e reembolsos 100% reais (APIs + webhooks por docs).
- Relatórios financeiros detalhados + mini BI.
- Segurança alta.
- Aplicar gradualmente (fases), com testes após cada uma.
- Documentar tudo aqui para passo a passo.

## 1. Entendimento dos Requisitos Enviados (associados ao que levantei)

### Requisitos Específicos do Pub (do que você enviou):
- **Sem meia-entrada**: Todos ingressos para maiores de 18 anos. (Associado ao benchmark: simplifica vs Sympla/Ingresso, foca em pub.)
- **1 local apenas**: Eventos só no restaurante do pub. (Foco em experiência simples, sem multi-venue.)
- **Virada de lotes**:
  - Preços aumentam de X em X (ex: lote promocional R$25, Lote 1 R$30).
  - Automática ao esgotar o lote atual.
  - Manual no admin: informar quantidade de ingressos + possibilidade de alterar o valor da virada.
- **Dashboard Admin completo**: Registros completos, visão gerencial.
- **Relatórios gerenciais detalhados por lotes do evento**:
  - Bruto vs Líquido (bruto - taxas cartão/Pix).
  - Taxas: % + valor fixo em centavos por transação (diferente por gateway).
  - Detalhamento de estornos.
  - Mini BI para análise (gráficos, resumos por lote/tempo/gateway).
- **Autenticação** (do query anterior):
  - Cliente: CPF/email + senha (além de código de acesso como fallback/guest).
  - Admin: Email + senha.
- **Cancelamentos**: 100% funcional, seguindo documentação oficial do Stripe (refunds.create) e Mercado Pago (refunds API + webhooks). Integrar com lotes/financeiro.

### Associação com o que Levantei (Revisão + Benchmark):
- Do benchmark: Lotes com virada (Sympla usa lotes + virada automática/manual para urgência). Relatórios por lote + financeiro detalhado (gap vs Sympla/Ingresso). Autenticação com conta real (email/senha ou CPF/senha, fallback código como Sympla). Cancelamento real per docs (reembolso real + webhooks).
- Da revisão: Segurança (TICKET_SECRET obrigatório, admin auth melhorado, sem fallbacks fracos). Remover "simulated". Imagens reais. Webhooks robustos (signature MP). next/image. Zod validation. Connection pooling MySQL serverless. Políticas claras (página dedicada alinhada CDC 7 dias + regras do pub). Dashboard expandido. Testes. Deploy com MySQL hospedado + env vars.
- Integração: Lotes/relatórios/BI do seu envio + autenticação + cancelamentos reais + todas sugestões do review para 100% funcional.

**Tudo associado**: O plano abaixo integra seus requisitos exatos com as sugestões para deixar o sistema profissional, alinhado com líderes, e pronto para produção.

## 2. Status Atual (o que já foi feito)
- MySQL local configurado (root sem senha, porta padrão) - schema atualizado para mysql, db push ok.
- Chaves de produção (live) no .env (Stripe pk/sk, MP public/access + cliente id/secret) - cuidado alto!
- Lotes: Modelo Lote no schema, virada manual no admin (form com qtd + preço), preço do lote usado no seletor/checkout, integração em orders e reports (gross/net por lote).
- Autenticação: Clientes com código + início de senha (buyerPasswordHash, lookup atualizado para password, set-password via código). Admin com email + senha (timingSafeEqual).
- Cancelamento: Request com validação de horas/taxa (do evento). Botão estornar atualizado para chamar APIs reais (Stripe refunds.create, MP PaymentRefund.create), atualizar status/tickets/cancellationRequest, enviar email, registrar financeiro. Webhooks com handling de refunds + signature básica MP.
- Relatórios: Por lote (gross/net/fee/refunds), mini BI com Recharts (cards + gráficos por lote/tempo/gateway), tabelas detalhadas.
- Docs: PRODUCTION_SETUP.md (guia prod), docs/SYMPA_INGRESSO_COM_BENCHMARK.md (benchmark), e este plano.
- Build/lint limpos (0 erros, 1 warning de <img>).
- App roda local (Ready, com seu MySQL + chaves).

**O que falta para 100%**:
- Virada automática completa (após esgotar).
- Refinamentos em relatórios (export CSV, mais BI).
- Testes manuais completos com chaves reais (cuidado: live!).
- Deploy (MySQL hospedado, env vars Vercel, webhooks reais).
- Imagens reais (remover picsum).
- Políticas claras em UI (página dedicada).
- Remover "simulated" ou isolar (só se sem chaves).
- Segurança extra (rate limit, etc.).

## 3. Novo Planejamento (Passo a Passo, Gradual)

Siga em ordem. Cada fase termina com:
- Teste local completo (compra → lote virado → acesso por senha → cancel → relatório).
- `npm run build`
- `npx prisma db push` (se schema mudou).
- Atualize docs (este + PRODUCTION_SETUP.md).

### Fase 0: Preparação e Limpeza (Imediato - hoje)
1. Limpe .env (remova chaves reais do repo; use .env.local para dev).
2. Atualize .env.example com MySQL + taxas exemplo (% + centavos por gateway) + chaves live placeholders.
3. Gere segredos fortes (TICKET_SECRET, ADMIN_PASSWORD).
4. Rode: `npx prisma generate`
5. **Teste**: `npm run build` (deve passar).
6. Atualize docs: Adicione nota em PRODUCTION_SETUP.md sobre "use chaves live só em Vercel, teste local com valores pequenos".

**Entregável**: Ambiente limpo e seguro.

### Fase 1: Autenticação (Login e Senha) - 1-2 dias
**Objetivo**: Cliente CPF/email + senha; Admin email + senha (associado ao seu pedido + revisão).

1. **Cliente**:
   - Schema: buyerPasswordHash em Order (já adicionado).
   - No checkout: campo opcional para definir senha no final.
   - Em /ingressos:
     - Login principal: CPF ou Email + Senha.
     - Fallback: Email + Código (mantido).
   - Rota POST /api/clients/set-password (verifica código/email).
   - Atualize lookup (/api/orders/lookup): Suporte a password.
   - UI: Abas ou campos "Com senha" vs "Com código". Após login com código, mostrar "Definir senha para login futuro".
   - Persistência: localStorage + backend.

2. **Admin**:
   - .env: ADMIN_EMAIL + ADMIN_PASSWORD.
   - /admin/login: campos Email + Senha.
   - /api/admin/login: validar email + senha com timingSafeEqual + bcrypt.
   - Melhorar: rate limit no login, httpOnly cookie, expiração 8h.

3. **Testes**:
   - Compre → acesse com código → defina senha → saia → login com CPF/email + senha.
   - Admin: login com email + senha.
   - Fallback código ainda funciona.

**Entregável**: Login como pedido. Seguro (sem fallback fraco).

### Fase 2: Lotes com Virada Automática + Manual - 2-3 dias
**Objetivo**: Exatamente como você descreveu (associado ao benchmark Sympla + revisão).

1. **Schema** (já iniciado):
   - model Lote { eventId, nome, precoCents, totalQty, sold, ordem, viradaAutomatica, ativo }
   - Event: lotes[], activeLoteId, loteAcrescimoCents (default 500), loteDefaultQty (50).
   - Order: loteId + gross/net/fee (ver Fase 3).

2. **Lógica de Virada**:
   - Ao criar evento: criar lote inicial ("Lote Promocional").
   - No seletor/checkout: preço = activeLote.precoCents.
   - Na compra: associar loteId, incrementar sold.
   - **Automática**: Após pagamento confirmado, se sold >= totalQty && viradaAutomatica → criar próximo lote:
     - nome = "Lote X"
     - preco = atual + acrescimo (do evento ou override)
     - qtd = default
     - Desativar anterior, ativar novo.
   - **Manual no Admin**: Form (qtd + novo preço opcional). Botão "Virar Lote". Cria, atualiza active.

3. **UI Admin**:
   - Seção "Lotes" após eventos: Tabela + botão "Virar Lote".
   - Mostrar lote atual no evento/checkout.

4. **Integração**:
   - Exibir lote atual no evento/checkout.
   - Histórico de vendas por lote (para relatórios).

**Testes**: Criar evento com lote promo. Comprar até esgotar → virada auto. Manual com preço diferente.

**Entregável**: Lotes 100% como descrito. Histórico por lote.

### Fase 3: Financeiro + Relatórios por Lotes + Mini BI - 3-4 dias
**Objetivo**: Exatamente como você descreveu (associado ao review + benchmark).

1. **Por pedido** (no sucesso do pagamento + webhook):
   - grossCents = totalCents
   - Calcular fee por gateway (de Settings):
     - Ex: pix_fee_percent=1.99, pix_fee_fixed_cents=0
     - card_fee_percent=3.99, card_fee_fixed_cents=49
   - netCents = gross - fee
   - feeDetails = "pix 1.99% + R$0.49"
   - No reembolso: registrar valor estornado.

2. **Relatórios** (atualizar /admin/reports + admin):
   - Por lote do evento: nome, qtd, bruto, líquido, taxa, estornos.
   - Tabelas detalhadas (data, lote, gateway, bruto, taxa, líquido, status).
   - Filtros: evento, lote, gateway, data.
   - Detalhamento de estornos.

3. **Mini BI** (Recharts):
   - Cards: Bruto total, Líquido total, Estornos, Ingressos, Taxa média.
   - Gráficos:
     - Barras: Bruto por Lote.
     - Linha: Vendas ao longo do tempo (por lote).
     - Pizza: Distribuição por gateway.
   - Drill-down: clique no lote → lista de pedidos + estornos.

4. **Dashboard Admin**: Visão geral + alertas (lote quase esgotando, estornos).

**Config**: Adicionar campos em Settings para taxas por gateway.

**Testes**: Compra com Pix vs Cartão (líquido diferente). Estorno → aparece detalhado por lote.

**Entregável**: Relatórios completos + BI.

### Fase 4: Cancelamento 100% Funcional (Docs Stripe + MP) - 2-3 dias
**Objetivo**: Reembolso real + webhooks (associado ao review + seu pedido + docs oficiais).

1. **Regras e Request**:
   - Manter validação no cliente (horas + taxa do evento).
   - Cria CancellationRequest (pending).

2. **Admin**:
   - Lista de pendentes (com lote, bruto, taxa calculada).
   - Aprovar: calcular valor (bruto * (1 - taxa/100)).
   - Chamar APIs reais:
     - Stripe: stripe.refunds.create({ payment_intent: order.paymentId, amount: cents })
     - MP: new PaymentRefund(mp).create({ payment_id: order.paymentId, body: { amount: units } })
   - Atualizar: order.status = 'refunded', tickets = 'cancelled'.
   - Atualizar CancellationRequest (approved + amount + notes).
   - Enviar email com valor real.
   - Registrar estorno no financeiro (aparece no relatório por lote).

3. **Webhooks** (já melhorados):
   - Stripe: handler para 'charge.refunded' → atualizar.
   - MP: handler para 'payment.refunded' + x-signature → atualizar.

4. **Integração**: Estornos aparecem em relatórios por lote.

**Testes**: Solicitar cancel → aprovar → reembolso real no gateway (ver no dashboard Stripe/MP) → email → relatório atualizado com estorno por lote.

**Entregável**: Cancelamento 100% funcional por docs.

### Fase 5: Melhorias do Benchmark + Polimento (paralelo ou após)
- Imagens reais (substituir picsum).
- Remover/isolar "simulated" (só se sem chaves).
- Validação Zod em rotas críticas.
- next/image + remotePatterns.
- MySQL serverless: ?connection_limit=5.
- Segurança: TICKET_SECRET obrigatório.
- Políticas: Página pública clara (CDC 7 dias + regras do pub, sem meia).
- Dashboard admin expandido (já coberto nas fases 2-4).
- Testes: Happy path (compra → lote virado → acesso por senha → cancel → relatório).

### Fase 6: Deploy e Operação (final)
- MySQL hospedado (Railway/Aiven - não localhost).
- Variáveis de ambiente no Vercel (todas as chaves, sem .env no repo).
- Configurar webhooks reais nos dashboards (Stripe + MP) com domínio.
- Testes manuais completos (compra → lote virado → acesso por senha → cancel → reembolso real → relatório com BI).
- Adicionar Sentry/logging.
- Atualizar docs finais.

## 4. Ordem Recomendada (Gradual)
1. Fase 0 + 1 (autenticação + limpeza).
2. Fase 2 (lotes + virada - core do que enviou).
3. Fase 3 (financeiro + relatórios + mini BI - core).
4. Fase 4 (cancelamento real).
5. Fase 5 + 6 (polimento + deploy).

**Após cada fase**: Rode `npm run dev` + teste fluxo completo + build + db push + atualizar docs.

## 5. Riscos e Avisos
- Chaves live: risco alto. Teste com valores pequenos.
- Virada concorrente: teste duas compras ao mesmo tempo.
- Reembolsos reais: teste e monitore.
- MySQL local: ok hoje, mude para hospedado antes de prod.
- Autenticação: use bcrypt (já).

**Documentação**:
- Este arquivo (docs/PLANO_IMPLEMENTACAO_ATUALIZADO.md).
- PRODUCTION_SETUP.md (guia de prod).
- docs/SYMPA_INGRESSO_COM_BENCHMARK.md (benchmark completo).

**Status Final Desejado**: Tudo 100% funcional, alinhado com docs e seus requisitos. Pronto para produção.

Se quiser, posso começar a implementar a Fase 1 ou 2 agora (edits no código + testes). Qual fase primeiro? Ou ajustes no plano?