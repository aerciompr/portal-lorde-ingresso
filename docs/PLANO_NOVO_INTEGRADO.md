# Plano Novo Integrado - Lorde Nelson Ingressos (Produção)

**Data:** 2026-06-16  
**Baseado em:** 
- Requisitos enviados por você (sem meia-entrada, 1 local/restaurante, virada automática de lotes com acréscimo fixo, manual por qtd + alterar valor, dashboard completo, relatórios por lotes com bruto/líquido/estornos, mini BI, login cliente CPF/email + senha + admin email + senha).
- O que levantei na revisão anterior + benchmark Sympla/Ingresso.com (sugestões de segurança, autenticação, cancelamentos 100% por docs, relatórios, etc.).
- Documentação oficial Stripe + MP para reembolsos/cancelamentos.
- Status atual do sistema (MySQL local + chaves live, lotes parciais, auth evoluindo, etc.).

**Objetivo:** Aplicar TUDO de forma integrada, 100% funcional, passo a passo, documentado. Foco em UX como Sympla/Ingresso (lotes, relatórios, login), mas adaptado ao pub (1 local, +18, eventos no restaurante).

## 1. Resumo do que Entendi dos Seus Requisitos + Associação com Revisão/Benchmark

### Requisitos Específicos (do que enviou):
- **Sem meia-entrada**: Todos ingressos para maiores de 18. (Associa com "simplificar políticas" do benchmark.)
- **1 local apenas**: Eventos só no restaurante do pub. (Foco em experiência simples, sem multi-venue.)
- **Virada de lotes**:
  - Preços aumentam de X em X (ex: promo R$25, Lote 1 R$30).
  - Automática ao esgotar o lote.
  - Manual no admin: informar quantidade + possibilidade de alterar o valor da virada.
- **Dashboard Admin completo**: Registros, relatórios gerenciais detalhados.
- **Relatórios**:
  - Detalhados por lotes do evento.
  - Bruto vs Líquido (bruto - taxas cartão/Pix).
  - Taxas: % + valor em centavos por transação (diferente por gateway).
  - Detalhamento de estornos.
  - Mini BI para análise (gráficos, resumos por lote/tempo/gateway).
- **Login**:
  - Cliente: CPF/email + senha (além de código de acesso como fallback).
  - Admin: Email + senha.
- **Cancelamentos**: 100% funcional, seguindo docs Stripe (refunds.create) + MP (refunds API + webhooks). Integrar com lotes/financeiro.

### Associação com o que Levantei (Revisão + Benchmark):
- Do benchmark: Lotes com virada (Sympla usa isso forte para urgência/vendas) → implementado como você descreveu.
- Relatórios por lote + financeiro detalhado (gap vs Sympla/Ingresso) → exatamente o que pediu (bruto/líquido, taxas, estornos, BI).
- Autenticação: Clientes com conta real (email/senha ou CPF/senha) + fallback código (como Sympla "Meus Ingressos" + código) → resolve "login como?" e sugestão de "conta para clientes".
- Admin: Email + senha (melhor que só senha).
- Cancelamento: 100% real per docs (alinhado com revisão: reembolso real via APIs + webhooks, cálculo de taxa).
- Outras do review: Segurança (TICKET_SECRET obrigatório, sem simulated em prod), imagens reais, webhooks robustos (signature MP), next/image, Zod, connection pooling, políticas claras (página dedicada alinhada CDC 7 dias + regras do pub).
- Sem meia, 1 local: Simplifica vs líderes (foco em pub/restaurante).

**Tudo associado**: O plano abaixo integra seus requisitos com as sugestões para deixar o sistema profissional, funcional e alinhado.

## 2. Status Atual (o que já foi feito)
- MySQL configurado (local root sem senha, via push anterior).
- Chaves live no .env (suas: Stripe pk/sk, MP public/access + cliente id/secret).
- Lotes: Schema com Lote model, virada manual no admin, preço do lote usado no checkout, integração em reports (bruto/net por lote).
- Autenticação: Cliente com código + início de senha (buyerPasswordHash no schema, lookup atualizado para password, set-password via código).
- Admin: Email + senha (timingSafeEqual, ADMIN_EMAIL).
- Cancelamento: Request com validação de horas/taxa (do evento), botão estornar atualizado para chamar APIs reais (Stripe refunds.create, MP PaymentRefund.create), webhooks com handling de refunds + signature básica MP, email com valor, marca como approved.
- Relatórios: Por lote (gross/net/fee/refunds), mini BI com Recharts (cards + gráficos por lote/tempo/gateway), detalhamento estornos.
- Docs: PRODUCTION_SETUP.md (com chaves, MySQL, lotes, etc.), benchmark criado.
- Build/lint limpos (0 erros).
- App roda local (Ready, com seu MySQL + chaves).

**O que falta para 100%**:
- Virada automática completa (após esgotar).
- Refinamentos em relatórios (export, mais BI).
- Testes manuais com suas chaves (cuidado: live!).
- Deploy (MySQL hospedado, env vars Vercel, webhooks reais).
- Imagens reais (substituir picsum).
- Políticas claras em UI (página dedicada).
- Remover "simulated" ou isolar (só se sem chaves).
- Segurança extra (rate limit, etc.).

## 3. Novo Planejamento (Passo a Passo, Gradual)

Siga na ordem. Cada fase termina com teste local + build + db push + atualização de docs. Associei sugestões do review (segurança, UX como Sympla/Ingresso, funcionalidade 100%).

### Fase 0: Preparação e Limpeza (Imediato)
- Limpe .env: Remova chaves reais (mantenha só em .env.local ou Vercel). Use placeholders.
- Atualize .env.example com MySQL + taxas exemplo (% + centavos por gateway) + chaves live placeholders.
- Gere segredos fortes (TICKET_SECRET já gerado, ADMIN_PASSWORD forte, NEXTAUTH_SECRET).
- Rode: `npx prisma generate`
- **Teste**: `npm run build` (deve passar).
- Atualize docs: Adicione nota em PRODUCTION_SETUP.md sobre "use chaves live só em Vercel, teste local com valores pequenos".

**Entregável**: Ambiente limpo. Risco de chaves live mitigado.

### Fase 1: Autenticação (Login/Senha) - 1-2 dias
**Associação**: Seu requisito + revisão (login real para clientes como Sympla, admin email+senha, segurança).

- **Cliente**:
  - Schema: buyerPasswordHash em Order (já adicionado).
  - Checkout: Campo opcional "Definir senha" (hash com bcrypt, salva em buyerPasswordHash).
  - /ingressos:
    - Login principal: CPF ou Email + Senha.
    - Fallback: Email + Código (ainda funciona, como guest).
  - Após login com código: Mostrar "Criar senha para login futuro".
  - Rota: POST /api/clients/set-password (verifica código/email, salva hash).
  - Atualize lookup (/api/orders/lookup): Suporte a password (além de code/email).
  - UI: Abas ou campos "Com senha" vs "Com código". Persistir em localStorage + backend.
- **Admin**:
  - .env: ADMIN_EMAIL + ADMIN_PASSWORD (forte).
  - /admin/login: Campos Email + Senha.
  - /api/admin/login: Validar email + senha com timingSafeEqual + bcrypt.
  - Melhorar: Rate limit no login, cookie httpOnly + secure + expiração.
- **Teste**:
  - Compre → acesse com código → defina senha → saia → login com CPF/email + senha.
  - Admin: Login com email + senha.
  - Fallback código ainda funciona para guest.

**Entregável**: Login como pedido. Seguro (sem fallback fraco).

### Fase 2: Lotes com Virada Automática + Manual - 2-3 dias
**Associação**: Seu requisito exato (preços +X, auto ao esgotar, manual por qtd + alterar valor) + benchmark (lotes como Sympla para urgência).

- **Schema** (já iniciado):
  - model Lote { eventId, nome, precoCents, totalQty, sold, ordem, viradaAutomatica, ativo }
  - Event: lotes[], activeLoteId, loteAcrescimoCents (default 500 = R$5), loteDefaultQty (50).
  - Order: loteId (já adicionado).

- **Lógica**:
  - Criar evento: Criar lote inicial ("Lote Promocional", preço do input, qtd).
  - Seletor/checkout: Preço = activeLote.precoCents (mostrar nome do lote).
  - Compra: Associar loteId no order, incrementar sold do lote.
  - **Virada Automática**: Após pagamento confirmado (pay route + webhooks), se sold >= totalQty && viradaAutomatica:
    - Criar novo lote: nome="Lote X", preco = atual + acrescimo (ou valor alterado), qtd = default.
    - Desativar anterior, ativar novo. Atualizar activeLoteId.
  - **Virada Manual no Admin**:
    - UI: Listar lotes por evento (nome, preço, vendidos/esgotados).
    - Form: Qtd para novo lote + novo preço (opcional, default + acrescimo).
    - Ação: Criar lote, desativar anterior, ativar novo.
  - Atualizar ticketTypes sold por lote (se necessário, ou global por evento).

- **UI Admin**:
  - Seção "Lotes" após eventos: Tabela + botão "Virar Lote".
  - Mostrar lote atual no evento/checkout.

- **Teste**:
  - Criar evento com lote promo R$25/50 qtd.
  - Comprar até esgotar → virada auto para R$30.
  - Manual: Virar para R$35/30 qtd.
  - Ver preço atualizado no checkout.

**Entregável**: Lotes 100% como descrito. Histórico por lote.

### Fase 3: Financeiro + Relatórios por Lotes + Mini BI - 3-4 dias
**Associação**: Seu requisito exato (bruto/líquido por lotes, taxas % + centavos, estornos detalhados, mini BI) + revisão (relatórios expandidos).

- **Financeiro por Pedido** (no sucesso do pagamento + webhook):
  - grossCents = totalCents
  - Calcular fee por gateway (de Settings ou config):
    - Ex: pix_fee_percent=1.99, pix_fee_fixed_cents=0
    - card_fee_percent=3.99, card_fee_fixed_cents=49
  - netCents = gross - fee
  - feeDetails = "pix 1.99% + R$0.49"
  - No reembolso: Registrar valor estornado (afeta líquido).

- **Relatórios** (atualizar /admin/reports + admin principal):
  - Por lote do evento: Nome lote, qtd vendida, bruto, líquido, taxa, estornos.
  - Tabelas detalhadas: Data, lote, gateway, bruto, taxa, líquido, status.
  - Filtros: Evento, lote, gateway, período.
  - Detalhamento de estornos (lista com gateway + valor).

- **Mini BI** (Recharts):
  - Cards: Bruto total, Líquido total, Estornos, Ingressos pagos, Taxa média efetiva.
  - Gráficos:
    - Barras: Bruto por Lote.
    - Linha: Vendas ao longo do tempo (por lote).
    - Pizza: Distribuição por gateway.
  - Drill-down: Clique no lote → lista de pedidos + estornos.

- **Dashboard Admin**: Visão geral (vendas hoje, por lote ativo) + alertas (lote quase esgotando, estornos pendentes).

- **Config**: Adicionar campos em Settings para taxas por gateway.

**Teste**: Compra com Pix vs Cartão (líquido diferente). Estorno → aparece detalhado por lote no relatório + BI.

**Entregável**: Relatórios 100% como pedido + mini BI.

### Fase 4: Cancelamento 100% Funcional (Docs Stripe + MP) - 2-3 dias
**Associação**: Seu requisito + revisão (reembolso real por docs, integrado com lotes/financeiro).

- **Regras e Request**:
  - Manter validação no cliente (horas + taxa do evento, do schema).
  - Cria CancellationRequest (pending).

- **Admin**:
  - Lista de pendentes (com lote, bruto, taxa calculada, valor sugerido).
  - Aprovar: Calcular valor (bruto * (1 - taxa/100)).
  - Chamar APIs reais (por docs):
    - Stripe: `stripe.refunds.create({ payment_intent: order.paymentId, amount: cents })`
    - MP: `new PaymentRefund(mp).create({ payment_id: order.paymentId, body: { amount: units } })`
  - Atualizar: order.status = 'refunded', tickets = 'cancelled'.
  - Atualizar CancellationRequest (approved + amount + notes).
  - Enviar email com valor real (sendCancellationApproved).
  - Registrar estorno no financeiro (aparece no relatório por lote).

- **Webhooks** (melhorar existentes):
  - Stripe: Handler para 'charge.refunded' / 'refund.succeeded' → atualizar status + request.
  - MP: Handler para 'payment.refunded' + validação x-signature (já melhorado) → atualizar.
  - Atualizar status automaticamente.

- **Integração**: Estornos aparecem em relatórios por lote. Histórico completo.

**Teste**: Solicitar cancel → aprovar → reembolso real no gateway (ver no dashboard Stripe/MP) → email → relatório atualizado com estorno por lote.

**Entregável**: Cancelamento 100% funcional por docs.

### Fase 5: Melhorias do Benchmark + Polimento (paralelo ou após)
- Imagens reais (substituir picsum por assets reais ou Unsplash).
- Remover/isolar "simulated" (só se sem chaves).
- Validação Zod em rotas críticas (create order, pay, refund, cancel).
- next/image + remotePatterns no next.config (já iniciado).
- MySQL serverless: Adicionar `?connection_limit=5&pool_timeout=10` na URL.
- Segurança: TICKET_SECRET obrigatório (já), rate limit no login/checkin.
- Políticas: Página pública clara (/politica-cancelamento) alinhada CDC (7 dias + horas antes) + regras do pub (sem meia, 1 local).
- Dashboard admin expandido (já coberto nas fases 2-4).
- Testes: Happy path (compra → lote virado → acesso por senha → cancel → relatório).

### Fase 6: Deploy e Operação (final)
- MySQL hospedado (Railway/Aiven/PlanetScale - não localhost).
- Variáveis de ambiente no Vercel (todas as chaves, TICKET_SECRET, etc. - sem .env no repo).
- Configurar webhooks reais nos dashboards (Stripe + MP) com domínio.
- Testes manuais completos (com chaves reais pequenas, ver reembolso, relatórios).
- Adicionar Sentry ou logging.
- Atualizar docs finais.

## 4. Ordem Recomendada (Gradual)
1. Fase 0 + 1 (autenticação + limpeza).
2. Fase 2 (lotes + virada - core do que enviou).
3. Fase 3 (financeiro + relatórios + mini BI - core).
4. Fase 4 (cancelamento real).
5. Fase 5 + 6 (polimento + deploy).

**Após cada fase**: Teste completo + build + db push + atualizar docs.

## 5. Riscos e Avisos
- Chaves live: Teste só com valores pequenos. Risco alto de cobranças reais.
- Virada concorrente: Teste duas compras ao mesmo tempo.
- Reembolsos reais: Monitore (alguns assíncronos via webhook).
- MySQL local: Ok hoje. Para prod, mude para hospedado.
- Autenticação: Use bcrypt (já).

**Documentação**:
- Este arquivo (docs/PLANO_IMPLEMENTACAO_ATUALIZADO.md).
- PRODUCTION_SETUP.md (guia de prod, atualize com lotes/auth/cancelamentos).
- docs/SYMPA_INGRESSO_COM_BENCHMARK.md (benchmark completo).

**Status Final Desejado**: Tudo 100% funcional, alinhado com docs e seus requisitos. Pronto para produção.

Se quiser, posso começar a implementar a Fase 1 ou 2 agora (edits no código). Qual primeiro? Ou ajustes no plano?