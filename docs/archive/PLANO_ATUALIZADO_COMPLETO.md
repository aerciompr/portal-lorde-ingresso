# Plano Atualizado e Integrado - Lorde Nelson Ingressos (Produção)

**Data:** 2026-06-16  
**Contexto:** Após benchmark Sympla/Ingresso.com, revisão do sistema, aplicação de sugestões, e requisitos específicos enviados (sem meia-entrada, 1 local, virada automática de lotes com acréscimo fixo, dashboard completo, relatórios gerenciais por lotes com bruto/líquido/estornos, mini BI, autenticação cliente CPF/email + senha e admin email + senha, cancelamentos 100% funcionais seguindo docs Stripe + MP).

Este documento associa **tudo** o que você enviou com o que foi levantado na revisão/benchmark, e cria um **novo planejamento passo a passo** para aplicação gradual. Tudo documentado para você seguir sequencialmente.

## 1. Entendimento do que foi enviado (associado ao review/benchmark)

### Requisitos Específicos do Pub (do que você enviou):
- **Sem meia-entrada**: Todos ingressos para maiores de 18 anos (simplifica muito).
- **1 local apenas**: Eventos no restaurante do pub (sem multi-venue).
- **Virada automática de lote**:
  - Preços aumentam de X em X (ex: lote promo R$25 → Lote 1 R$30).
  - Automática ao esgotar o lote atual.
  - Manual no admin: informar quantidade de ingressos + possibilidade de alterar o valor da virada.
- **Dashboard Admin completo**:
  - Registros completos.
  - Relatórios gerenciais detalhados por lotes do evento.
  - Valores brutos e líquidos.
  - Líquido = bruto - taxas (cartão e Pix).
  - Taxas: % + valor fixo em centavos por transação (diferente por gateway).
  - Detalhamento de estornos nos relatórios.
  - Mini BI para análise (gráficos, resumos por lote/tempo/gateway).
- **Autenticação** (do query anterior):
  - Cliente: CPF/email + senha (além de código de acesso como fallback/guest).
  - Admin: email + senha.
- **Cancelamentos**: 100% funcional, seguindo documentação oficial do Stripe e Mercado Pago (reembolsos reais via API + webhooks).

### Associação com o que foi levantado (review + benchmark Sympla/Ingresso):
Do benchmark:
- Sympla/Ingresso usam **lotes com virada** (forte em Sympla) → implementaremos exatamente como você descreveu.
- Relatórios por lote + financeiro detalhado (bruto/líquido, taxas, estornos) → cobre o gap identificado (relatórios atuais são básicos por evento).
- Dashboard gerencial + mini BI → estende o que já existe (Recharts) para visão profissional.
- Autenticação forte (conta real para cliente) → resolve o ponto "login como?" que você levantou e o gap vs líderes.
- Cancelamento real (não só status) → alinha com CDC + docs das gateways (7 dias + regras do evento).

Do review geral:
- Segurança (TICKET_SECRET obrigatório, admin auth melhorado, sem fallbacks fracos).
- Remover "simulated" em prod.
- Webhooks robustos (já iniciado com assinatura MP).
- Imagens reais (remover picsum).
- Validação + next/image.
- MySQL serverless (pooling).
- Políticas claras + página dedicada.
- Testes manuais + deploy.

**Status atual do sistema** (do que foi feito até agora):
- Schema MySQL (provider=mysql, sem url no schema por Prisma 7).
- Cliente Prisma limpo (sem adapter SQLite).
- .env com MySQL local + chaves live (você forneceu) + TICKET_SECRET forte gerado + ADMIN forte.
- Lotes parciais (modelo adicionado, virada manual iniciada, preço do lote usado no checkout).
- Cancelamento: request com validação de regras + botão estornar (placeholder → agora com chamada real em progresso).
- Relatórios básicos (por evento).
- Autenticação: cliente com código + início de senha; admin com senha.
- Docs: PRODUCTION_SETUP.md + benchmark.
- Build/lint limpos (0 erros, 1 warning img).
- App roda local (Ready).

**Riscos atuais**:
- Chaves live no .env (nunca commite, use só local).
- MySQL local (ok para dev, use hospedado para prod).
- Virada concorrente (duas compras ao mesmo tempo).
- Reembolsos reais vão debitar (teste com valores pequenos).

## 2. Novo Planejamento Passo a Passo (Associado + Gradual)

Dividido em **Fases** para aplicar "aos poucos". Cada fase tem:
- Objetivo
- Tarefas específicas (com associação)
- Entregáveis
- Testes
- Atualização de docs

Siga em ordem. Após cada fase, rode `npm run dev`, teste o fluxo completo (compra → lote virado → acesso → cancel → relatório), e atualize o .env se necessário.

### Fase 0: Preparação e Limpeza (Imediato - hoje)
**Objetivo**: Base limpa + segura (associa com "segurança" do review + "chaves" do seu envio).

- Atualize .env (já feito parcialmente):
  - DATABASE_URL = seu MySQL local.
  - Todas as chaves live que você passou.
  - TICKET_SECRET forte (gerado: [PLACEHOLDER - gere um novo com node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" ]).
  - ADMIN_PASSWORD forte.
  - Adicione ADMIN_EMAIL (para login admin).
- Gere .env.example limpo (placeholders apenas, sem chaves reais).
- Rode `npx prisma generate`.
- **Ação manual**: Crie o banco no seu MySQL local se não existir: `CREATE DATABASE lordenelson_ingressos;`
- Atualize .gitignore (já tem .env*).

**Entregável**: Ambiente local seguro com seus dados reais.

**Teste**: `npm run build` limpo.

**Doc**: Atualize PRODUCTION_SETUP.md (seção "Chaves e Segredos").

### Fase 1: Autenticação (Login e Senha) - 1-2 dias
**Objetivo**: Cliente (CPF/email + senha) + Admin (email + senha). Mantém código de acesso como fallback (associa com "autenticação" do seu query + benchmark).

- **Cliente**:
  - Adicione `buyerPasswordHash` no Order (schema já atualizado em iterações).
  - No checkout: campo opcional para definir senha no final (ou após primeira compra).
  - Em /ingressos:
    - Login com CPF ou Email + Senha (novo, principal).
    - Fallback: Email + Código (mantido).
  - Fluxo "definir senha": Após login com código, mostrar form para criar senha (POST /api/clients/set-password, verifica código + email).
  - Persistência: localStorage + backend.
- **Admin**:
  - Adicione ADMIN_EMAIL no .env.
  - /admin/login: campos Email + Senha.
  - Validação: bcrypt + timingSafeEqual.
  - Melhorar: rate limit básico no login (middleware simples).
- Atualize lookup API (/api/orders/lookup) para suportar password.
- Atualize UI /ingressos (abas ou campos: "Com senha" vs "Com código").

**Entregável**: Clientes logam com CPF/Email + senha. Admin com email + senha. Código ainda funciona como guest.

**Teste**: 
- Compre → acesse com código → defina senha → saia → login com email + senha.
- Admin: login com email + senha.

**Doc**: Seção "Autenticação" em PLANO e PRODUCTION_SETUP.md.

### Fase 2: Sistema de Lotes com Virada Automática + Manual - 2-3 dias
**Objetivo**: Exatamente como você descreveu (associa com "lotes" do benchmark Sympla + seu requisito).

- **Modelo** (schema.prisma - já iniciado):
  - Lote: eventId, nome, precoCents, totalQty, sold, ordem, viradaAutomatica, ativo.
  - Event: lotes[], activeLoteId, loteAcrescimoCents (default 500 = R$5), loteDefaultQty (default 50).
  - Order: loteId + campos financeiros (gross/net/fee).

- **Lógica de Virada**:
  - Ao criar evento: criar lote inicial ("Lote Promocional").
  - No seletor/checkout: preço = activeLote.precoCents.
  - Na compra: associar loteId, incrementar sold do lote.
  - **Automática**: Após venda paga, se sold >= totalQty && viradaAutomatica → criar próximo:
    - nome = "Lote N"
    - preco = atual + acrescimo (do evento ou override)
    - qtd = default
    - Desativar anterior, ativar novo.
  - **Manual no Admin**: Form (qtd + novo preço opcional). Botão "Virar Lote" por evento. Cria, atualiza active.

- **UI**:
  - Mostrar lote atual no evento/checkout ("Lote Promocional - R$25").
  - Admin: listar lotes + botão virar (com inputs qtd + preço).

**Entregável**: Lotes viram auto/manual. Preços aumentam. Vendas associadas ao lote.

**Teste**: Crie evento com lote promo. Compre até esgotar → virada auto. Manual com preço diferente.

**Doc**: Seção "Lotes e Virada" + exemplos no PLANO.

### Fase 3: Financeiro, Relatórios por Lote + Mini BI - 3-4 dias
**Objetivo**: Exatamente como você descreveu (associa com "relatórios" do review + benchmark).

- **Por pedido** (no sucesso do pagamento + webhook):
  - grossCents = totalCents
  - Calcule fee por gateway (de Settings ou config central):
    - Ex: pix_fee_percent=1.99, pix_fee_fixed_cents=0
    - card_fee_percent=3.99, card_fee_fixed_cents=49
  - netCents = gross - fee
  - feeDetails = "pix 1.99% + R$0.49"
  - No reembolso: registrar valor estornado (impacta líquido).

- **Relatórios** (atualize /admin/reports + admin):
  - Por lote do evento: nome do lote, qtd, bruto, líquido, taxa, estornos.
  - Tabelas detalhadas (data, lote, gateway, bruto, taxa, líquido, status).
  - Filtros: evento, lote, gateway, período.
  - Detalhamento de estornos (lista com gateway + valor).

- **Mini BI** (Recharts):
  - Cards: Bruto total, Líquido total, Estornos, Ingressos pagos, Taxa média efetiva.
  - Gráficos:
    - Barras: Bruto por Lote.
    - Linha: Vendas ao longo do tempo (por lote).
    - Pizza: Distribuição por gateway.
  - Drill-down: clique no lote → lista de pedidos + estornos.

- **Dashboard Admin**: Visão geral + alertas (lote quase esgotando).

**Entregável**: Relatórios completos com bruto/líquido/estornos por lote + mini BI visual.

**Teste**: Compra Pix vs Cartão → ver líquido diferente. Estorno → aparece detalhado por lote.

**Doc**: Seção "Relatórios e BI" + exemplos de queries/gráficos.

### Fase 4: Cancelamento 100% Funcional (Docs Stripe + MP) - 2-3 dias
**Objetivo**: Reembolso real, integrado com lotes/financeiro (associa com "cancelamento" do review + seu requisito + docs oficiais).

- **Regras**: Já existem (horas + % taxa por evento). Manter validação no cliente.
- **Request**: Cliente solicita → cria CancellationRequest (pending).
- **Admin**:
  - Lista de pendentes (com lote, bruto, taxa calculada).
  - Aprovar: calcular valor (bruto * (1 - taxa/100)).
  - Chamar APIs reais:
    - Stripe: `stripe.refunds.create({ payment_intent: order.paymentId, amount: cents })`
    - MP: `new PaymentRefund(mp).create({ payment_id: order.paymentId, body: { amount: units } })`
  - Atualizar: order → 'refunded', tickets → 'cancelled', CancellationRequest (approved + amount + notes).
  - Enviar email com valor real.
  - Registrar estorno no financeiro (aparece no relatório por lote).
- **Webhooks** (já melhorados):
  - Stripe: 'charge.refunded' → atualizar.
  - MP: 'payment.refunded' + validação x-signature → atualizar.
- **UI**: Botão "Estornar" agora faz reembolso real + marca request.

**Entregável**: Fluxo completo: solicitar → aprovar → reembolso real no gateway → status + email + relatório atualizado.

**Teste**: Solicite cancel → aprove → ver reembolso no dashboard Stripe/MP + email + relatório com estorno por lote.

**Doc**: Seção "Cancelamento e Reembolsos" (com links para docs oficiais).

### Fase 5: Melhorias do Benchmark + Polimento (paralelo ou após Fase 4)
- Imagens reais (substitua picsum).
- Remova/ isole "simulated" (só se não tiver chaves).
- Validação Zod em rotas críticas.
- next/image + remotePatterns.
- MySQL serverless: `?connection_limit=5&pool_timeout=10`.
- Segurança: TICKET_SECRET obrigatório.
- Políticas: Página pública clara (CDC 7 dias + regras do pub).
- Dashboard admin expandido (já coberto nas fases 2-4).

### Fase 6: Deploy e Operação Final
- MySQL hospedado (Railway/Aiven - não localhost).
- Variáveis de ambiente no Vercel (todas as chaves, sem .env no repo).
- Configure webhooks reais nos dashboards (com domínio).
- Testes manuais completos (compra → lote virado → acesso por senha → cancel → reembolso real → relatório com BI).
- Adicione Sentry/logging básico.
- Atualize docs finais.

## 8. Ordem Recomendada de Aplicação (Gradual)
1. Fase 0 + 1 (autenticação + limpeza).
2. Fase 2 (lotes + virada - core do que você enviou).
3. Fase 3 (relatórios/BI + financeiro - core do que você enviou).
4. Fase 4 (cancelamento real).
5. Fase 5 + 6 (polimento + deploy).

**Após cada fase**:
- Rode `npm run dev` + teste fluxo completo.
- Rode `npm run build`.
- Atualize este plano + PRODUCTION_SETUP.md.
- Rode `npx prisma db push` se mudou schema.

## 9. Riscos e Avisos Finais
- Chaves live: risco alto. Teste com valores pequenos.
- Virada concorrente: teste duas compras ao mesmo tempo.
- Reembolsos reais: teste e monitore.
- MySQL local hoje → hospedado para prod.
- Autenticação: use bcrypt (já no código).

**Documentação**:
- Este arquivo (docs/PLANO_IMPLEMENTACAO_ATUALIZADO.md).
- PRODUCTION_SETUP.md (guia de prod).
- docs/SYMPA_INGRESSO_COM_BENCHMARK.md (benchmark).

Tudo associado: lotes/relatórios do seu envio + autenticação + cancelamentos do review + benchmark.

Se quiser, posso começar a implementar a Fase 1 ou 2 agora (edits no código + testes). Qual fase primeiro? Ou quer ajustes no plano?