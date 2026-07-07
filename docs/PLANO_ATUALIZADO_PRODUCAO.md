# Plano Atualizado de Implementação - Lorde Nelson Ingressos

**Data:** 2026-06
**Contexto:** Após revisão completa (benchmark Sympla/Ingresso.com), aplicação de sugestões, requisitos específicos do pub (sem meia-entrada, 1 local, eventos no restaurante, virada de lotes, relatórios detalhados, mini BI), autenticação cliente (CPF/email + senha) e admin (email + senha), e foco em cancelamentos 100% funcionais conforme docs Stripe/MP.

**Status atual (baseado em execuções anteriores):**
- MySQL configurado (local root sem senha).
- Chaves de produção (Stripe + MP) no .env (cuidado: use só local/teste).
- Lotes básicos iniciados (modelo, virada manual/auto parcial).
- Cancelamento com request + aprovação (mas precisa reembolso real).
- Login cliente/admin em evolução.
- Docs: PRODUCTION_SETUP.md + benchmark.
- Build/lint limpos (0 erros).
- App roda local (Ready).

**Premissas do pub:**
- Sem meia-entrada (maior de 18+).
- 1 único local (restaurante).
- Eventos presenciais no pub.
- Virada automática de lotes com acréscimo fixo (ex: promo R$25 → Lote1 R$30 ao esgotar ou manual).
- Admin: virada informando qtd + alterar valor.
- Relatórios: por lotes, bruto/líquido (taxas % + centavos/transação por gateway), estornos detalhados, mini BI.
- Autenticação: Cliente = CPF/Email + senha; Admin = Email + senha.
- Cancelamento/reembolso real seguindo docs oficiais.

## Fase 0: Preparação e Limpeza (Imediato - 1 dia)
- [x] Atualizar .env com MySQL local + chaves (feito).
- [x] Gerar segredos fortes (TICKET_SECRET, ADMIN_PASSWORD).
- [ ] **Ação:** Remover chaves reais do .env antes de commit/deploy. Usar placeholders + .env.local.
- [ ] **Ação:** Criar .env.example limpo.
- [ ] **Ação:** Rodar `npx prisma db push` após mudanças de schema.
- [ ] Documentar segredos em local seguro (não no repo).

**Documento de referência:** Atualizar `docs/PLANO_ATUALIZADO_PRODUCAO.md` (este) e `PRODUCTION_SETUP.md`.

## Fase 1: Autenticação (Login e Senha) - Cliente e Admin
**Requisito:** Cliente usa CPF/Email + senha; Admin usa Email + senha. Manter accessCode como fallback/guest.

### 1.1 Cliente (CPF/Email + Senha)
- Adicionar campo `buyerPasswordHash` no modelo Order (ou normalizar para Buyer model).
- No checkout: oferecer campo opcional de senha ao final (ou após primeira compra).
- Login em /ingressos:
  - Opção 1 (atual): Email + accessCode.
  - Opção 2 (novo): CPF ou Email + Senha.
  - Fallback: Se senha não definida, força uso de código.
- Fluxo de "definir senha": Após login com código, oferecer "Criar senha para acesso futuro".
- Hash com bcryptjs.
- Persistir no localStorage + backend (sessão simples).

**Passos código:**
- Atualizar schema + db push.
- Criar/atualizar rotas: POST /api/clients/set-password (verifica código/email).
- Atualizar /api/orders/lookup para aceitar password.
- Atualizar UI /ingressos (abas ou campos condicionais para login).
- Atualizar auto-login do localStorage.

**Entregável:** Clientes logam com CPF/Email + senha. AccessCode continua funcionando.

### 1.2 Admin (Email + Senha)
- Adicionar ADMIN_EMAIL no .env.
- Login em /admin/login: campos Email + Senha.
- Validação: comparar email + hash da senha (bcrypt).
- Melhorar segurança: rate limit no login, httpOnly cookie, expiração.
- Remover fallback 'admin123'.

**Passos código:**
- Atualizar /api/admin/login e lib/auth.ts.
- Atualizar UI do login.
- Atualizar .env e docs.

**Entregável:** Admin usa email + senha forte.

## Fase 2: Sistema de Lotes com Virada Automática e Manual
**Requisito:** Virada automática ao esgotar (preço +X), ou manual no admin (informar qtd + alterar valor). 1 local, sem meia.

### 2.1 Modelo de Dados
- Adicionar modelo `Lote`:
  - eventId, nome, precoCents, totalQty, sold, ordem, viradaAutomatica, ativo.
- Em Event: activeLoteId, loteAcrescimoCents (default 500 = R$5), loteDefaultQty.
- Em Order: loteId (para rastrear qual lote foi vendido).
- Atualizar TicketType se necessário (preços por lote ou override).

### 2.2 Lógica de Virada
- **Automática:** Ao criar pedido pago, verificar se lote atual sold >= totalQty + viradaAutomatica=true → criar próximo lote:
  - nome = "Lote X"
  - preco = anterior + acrescimo
  - qtd = default ou informado
  - Desativar anterior, ativar novo.
- **Manual no Admin:**
  - Em /admin: listar lotes do evento.
  - Botão "Virar Lote": inputs para novo nome/preço/qtd.
  - Criar novo lote, atualizar activeLote, desativar anterior.
  - Permitir alterar valor da virada (override do acrescimo).

### 2.3 Integração no Fluxo de Compra
- No seletor de ingressos e checkout: mostrar preço do lote atual (precoCents do activeLote).
- Ao criar order: associar ao activeLote, incrementar sold do lote.
- Exibir lote no "Meus Ingressos" e relatórios.

**Entregável:** Lotes viram auto ou manual. Preços aumentam. Histórico por lote.

## Fase 3: Relatórios Gerenciais, Financeiros e Mini BI
**Requisito:** Por lotes do evento. Bruto vs Líquido (descontando taxas cartão/Pix: % + centavos/transação). Detalhamento de estornos. Mini BI.

### 3.1 Rastreamento Financeiro
- Em Order (ao confirmar pagamento):
  - grossCents = totalCents
  - Calcular fee por gateway (config em Settings ou .env):
    - Ex: pix_fee_percent=1.99, pix_fee_fixed_cents=0
    - card_fee_percent=3.99, card_fee_fixed_cents=49
  - netCents = gross - fee
  - feeDetails = "pix 1.99% + R$0.49" (string legível)
- No reembolso: registrar valor reembolsado (afeta líquido).

### 3.2 Relatórios
- Atualizar /admin/reports e página admin principal:
  - **Por Lote/Evento:** Nome do lote, qtd vendida, bruto, líquido, estornos.
  - Tabelas detalhadas (data, lote, gateway, bruto, taxa, líquido, status).
  - Filtros: por evento, lote, gateway, data.
- **Estornos:** Listar reembolsos com gateway, valor, data.
- **Mini BI (Recharts ou similar):**
  - Gráfico de barras: Bruto por Lote.
  - Linha: Vendas ao longo do tempo (por lote).
  - Pizza: Distribuição por gateway.
  - Cards: Bruto total, Líquido total, Total estornos, Taxa média efetiva, Ingressos por lote.
  - Export CSV simples.

### 3.3 Dashboard Admin
- Visão geral: Vendas hoje/semana, por lote ativo, top eventos.
- Alertas: Lote quase esgotando, reembolsos pendentes.

**Entregável:** Relatórios completos com bruto/líquido/estornos por lote + mini BI visual.

## Fase 4: Cancelamento e Reembolsos 100% Funcionais (Docs Stripe + MP)
**Requisito:** Seguir docs oficiais. Integrar com lotes/financeiro.

### 4.1 Fluxo Cliente
- Em /ingressos: "Solicitar cancelamento" (já tem validação de horas/taxa).
- Cria CancellationRequest (pending).
- Mostra status.

### 4.2 Fluxo Admin
- Em /admin: Seção "Cancelamentos Pendentes" (listar com detalhes do lote, bruto, taxa calculada).
- Aprovar/Rejeitar + notas.
- Ao aprovar:
  - Calcular valor reembolso: bruto * (1 - taxa/100) ou conforme regra.
  - Chamar API real:
    - **Stripe:** stripe.refunds.create({ payment_intent: order.paymentId, amount: refundCents })
    - **Mercado Pago:** PaymentRefund.create({ payment_id: order.paymentId, body: { amount: refundCents/100 } })
  - Atualizar order.status = 'refunded', tickets = 'cancelled'.
  - Atualizar CancellationRequest (approved + refundAmount + processedAt).
  - Enviar email com valor real (já tem sendCancellationApproved).
  - Registrar no financeiro (refund amount).

### 4.3 Webhooks para Reembolsos
- **Stripe:** Adicionar handler para 'charge.refunded' / 'refund.succeeded' → atualizar order/tickets/request.
- **MP:** Handler para action 'payment.refunded' → mesmo update. Validar assinatura (x-signature).
- Atualizar status automaticamente.

### 4.4 Integração com Lotes/Financeiro
- Estornos aparecem nos relatórios por lote (subtraem do líquido).
- Histórico de reembolsos detalhado.

**Seguir docs:**
- Stripe: https://stripe.com/docs/refunds (amount em centavos, partial ok).
- MP: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-configuration/refunds (amount em reais, por payment_id).

**Entregável:** Cancelamento end-to-end funcional: request → approve → reembolso real no gateway → status + email + relatório atualizado.

## Fase 5: Outras Melhorias do Review (Aplicar Gradualmente)
- **Login cliente:** CPF/Email + senha (integrar com Fase 1).
- **Admin email+senha:** Já em Fase 1.
- **Imagens reais:** Substituir picsum (pasta public ou URLs).
- **Webhooks robustos:** Idempotência + signature MP (já em Fase 4).
- **Sem simulated em prod:** Guardar por env (STRIPE/MP keys presentes → desabilitar).
- **Zod validation:** Em rotas críticas (create order, pay, refund, cancel).
- **next/image:** Substituir <img> onde possível + config domains.
- **MySQL serverless:** Adicionar ?connection_limit=5 na URL.
- **Segurança:** Remover fallbacks fracos, timingSafeEqual admin.
- **Testes:** Adicionar pelo menos happy path de compra + cancelamento.
- **Políticas:** Página pública clara (CDC 7 dias + regras do pub).

## Fase 6: Deploy e Operação
- Migrar para MySQL hospedado (Railway/Aiven recomendado).
- Vercel: variáveis de ambiente (todas as keys, sem .env no repo).
- Configurar webhooks reais nos dashboards (Stripe/MP) com domínio.
- Testes manuais completos (compra real pequena, cancelamento, reembolso, relatórios).
- Monitoramento (Sentry básico).
- Documentação final: atualizar PRODUCTION_SETUP.md + este plano.

## Plano de Aplicação Gradual (Passo a Passo)
1. **Hoje:** Fase 0 + Fase 1 (autenticação login/senha) + fix TICKET_SECRET required.
2. **Amanhã:** Fase 2 (lotes + virada completa + integração no checkout).
3. **Depois:** Fase 3 (financeiro + relatórios + mini BI com Recharts).
4. **Em seguida:** Fase 4 (cancelamento real + webhooks + integração relatórios).
5. **Paralelo:** Fase 5 itens críticos (imagens, next/image, validação).
6. **Final:** Fase 6 (deploy + testes + docs).

**Riscos e Avisos:**
- Chaves live no .env local: risco alto. Use só para testes controlados.
- MySQL local: ok para dev. Para prod, mude para hospedado.
- Teste sempre com valores pequenos.
- Após mudanças de schema: npx prisma db push.

**Próximo passo recomendado:** Comece pela Fase 1 (login) + rodar o app localmente com seus dados para validar.

Se quiser, posso implementar o código da Fase 1 ou 2 agora (edits no schema, rotas, UI, etc.).

Documento salvo em: docs/PLANO_ATUALIZADO_PRODUCAO.md

Qual passo quer atacar primeiro?