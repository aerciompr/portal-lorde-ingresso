# Benchmark: Sympla vs Ingresso.com vs Lorde Nelson Ingressos

**Data:** 2026-06
**Objetivo:** Estudar fluxos de compra, políticas e experiência do usuário das plataformas líderes para melhorar o portal Lorde Nelson Ingressos (Next.js + MySQL + Stripe/MP).

## 1. Sympla (sympla.com.br)

### Fluxo de Compra (até finalização)
1. **Descoberta**: Busca por eventos (cidade, data, categoria). Filtros avançados.
2. **Página do Evento**:
   - Título, data/horário, local (mapa), descrição, fotos/vídeos.
   - Ingressos por **lotes** (com virada automática de preço).
   - Tipos: inteira, meia, grupos/subgrupos.
   - Seleção de quantidade + adicionar ao carrinho.
   - Regras claras de cancelamento, meia-entrada.
3. **Carrinho**:
   - Resumo.
   - Opção de adicionar **Sympla Store** (produtos/serviços extras) **durante a compra de ingressos**.
4. **Dados do Comprador**:
   - Nome, email, CPF (obrigatório em muitos), telefone.
   - Criação/login de conta: email, Google SSO, SMS/WhatsApp (código).
5. **Pagamento**:
   - Cartão (parcelamento), Pix, boleto, Google Pay, Apple Pay.
   - Análise de risco/fraude.
6. **Confirmação**:
   - Pagamento aprovado → ingressos gerados automaticamente.
   - Envio por email (PDF + QR).
   - Disponível imediatamente na **Carteira do App Sympla** (melhor experiência).
   - Check-in via app (QR) ou impressão.
7. **Pós-Compra ("Meus Ingressos")**:
   - App Sympla: carteira offline, histórico, check-in.
   - Site: Login → Meus Ingressos / Carteira.
   - Integração com carteiras digitais em alguns casos.

**Destaques**:
- Lotes com virada de preço.
- Compra integrada de add-ons (Sympla Store).
- App forte para portabilidade e check-in.
- Login flexível (código por SMS/WhatsApp/Email, Google).
- Repasse ao produtor: 3º dia útil após o evento (integral, parcelamento é para o comprador).
- Taxa ~10% para presenciais.

### Políticas Principais
- **Cancelamento/Reembolso** (alinhado CDC):
  - Até **7 dias corridos** após a compra.
  - + Até **48 horas antes** do evento (se dentro dos 7 dias).
  - Reembolso automático em muitos casos (pode descontar taxa de serviço).
  - Produtor define política própria (deve ser clara e divulgada).
  - Pedido via plataforma ou suporte (titular da compra com email usado).
- Repasse ao produtor: 3 dias úteis após evento.
- Ingresso Protegido (opção de seguro?).
- LGPD: Dados para emissão de ingressos e comunicação.
- Produtor responsável pelo evento e reembolsos em caso de cancelamento.

**Termos chave**:
- Compra confirmada após aprovação do pagamento.
- Ingressos em PDF ou app (QR).
- Cancelamento: automático em muitos casos, produtor pode solicitar.

## 2. Ingresso.com

### Fluxo de Compra
1. **Descoberta**: Busca por filmes/eventos, cinemas, datas. Filtros por localização.
2. **Página do Evento/Sessão**:
   - Detalhes, horários/sessões, trailers.
   - Seleção de assentos (para cinema/teatro).
   - Tipos: inteira, meia-entrada, etc.
3. **Seleção e Carrinho**:
   - Quantidades, tipos de ingresso.
   - Resumo.
4. **Dados do Comprador**:
   - Nome, email, CPF (muito enfatizado para meia), telefone.
   - Criação de conta ou login.
5. **Pagamento**:
   - Cartão, Pix, boleto, etc.
   - Análise de risco.
6. **Confirmação**:
   - Ingressos no "Meus Pedidos" ou conta.
   - Email + PDF/QR ou acesso via conta/app.
   - Para cinema: integração com apps de cinema.
7. **Pós-Compra**:
   - "Meus Pedidos" ou conta para acessar ingressos (QR).
   - Cancelamento via "Meus Pedidos" (limitado).

**Destaques**:
- Forte em seleção de assentos.
- Integração com redes de cinema.
- "Meus Pedidos" claro.
- Conta para histórico.

### Políticas Principais
- **Cancelamento**:
  - Direito de arrependimento: até **7 dias corridos** da compra (se sessão >7 dias à frente).
  - Para sessões próximas: até 1 hora antes em alguns casos (ex: cinema).
  - Limite: até 4 cancelamentos por mês por usuário.
  - Reembolso pelo mesmo método (cartão: até 10 dias úteis; Pix/boleto: conta de origem).
  - Cancelamento só pelo titular via plataforma ou atendimento.
  - Regras específicas por cinema/produtor (ex: Cinépolis via Ingresso.com).
- Reembolsos: Apenas valor do ingresso (taxa administrativa pode ser retida em alguns casos). Integral se cancelamento pelo produtor.
- Fraude: Análise pelo processador de pagamento.
- LGPD padrão.

## 3. Comparação com Lorde Nelson Ingressos (atual)

### Fluxo Atual (do código)
- Home com lista de eventos (próximos, com banner).
- Página de evento: detalhes + seletor de quantidades por tipo de ingresso.
- Checkout: formulário buyer (nome, email, CPF, telefone) → escolha gateway (Pix/Cartão) → pagamento transparente (Stripe/MP).
- Confirmação: redirect para /ingressos com email + accessCode (LN-XXXXXX).
- Acesso pós-compra: /ingressos (email + código ou persistência localStorage) → lista de pedidos + QR preview + download PDF + solicitar cancelamento.
- Check-in: página /checkin com scanner QR (html5-qrcode) + manual.
- Admin: CRUD básico de eventos, pedidos, configurações de cancelamento (horas + taxa %), reembolsos (manual via gateway).
- Tickets: PDF com QR assinado (HMAC).
- Cancelamento: Solicitação via app (valida regras do evento) → admin aprova → estorno.

**Pontos Fortes Atuais vs Plataformas**:
- Checkout transparente e simples (guest-friendly, sem cadastro obrigatório).
- AccessCode + email para "Meus Ingressos" (bom para pub pequeno).
- QR assinado com HMAC (boa antifraude básica).
- Suporte real a Pix (MP) + Cartão + webhooks.
- Regras de cancelamento por evento (horas antes + % taxa) configuráveis no admin.
- Check-in simples e funcional.

**Gaps vs Sympla/Ingresso.com**:
- **Sem conta/login real para clientes**: Apenas código de acesso ou localStorage. Sympla/Ingresso têm "Meus Ingressos" com conta (email/senha ou SSO), app, histórico persistente.
- **Sem app ou experiência mobile-first dedicada**: Sympla tem app excelente para carteira offline, check-in, digital wallet.
- **Sem lotes/virada de preço**: Sympla usa lotes com virada automática (aumenta urgência/vendas).
- **Cancelamento**: Request → admin aprova (bom), mas sem self-service completo, sem reembolso automático via gateway em todos casos, sem política clara visível alinhada ao CDC (7 dias + proximidade).
- **Sem parcelamento visível** para comprador (Sympla destaca).
- **Sem integração de produtos extras** durante compra (Sympla Store).
- **Imagens e UX**: Ainda usa picsum/demo em alguns lugares; checkout menos polido e "confiança" menor.
- **Políticas**: Não tem página clara de "Políticas de Cancelamento" alinhada com CDC como os líderes.
- **Fraud/Confiança**: Menos análise avançada visível.
- **Check-in**: Funcional, mas Sympla/Ingresso têm apps mais robustos + integração.
- **Repasse (para produtor)**: Não há menção clara (Sympla tem repasse em 3 dias úteis).

### Políticas de Cancelamento
- **Sympla**: 7 dias corridos após compra + 48h antes do evento. Reembolso automático em muitos casos. Produtor define + divulga. Repasse 3 dias após evento.
- **Ingresso.com**: 7 dias (se sessão distante), limite 4x/mês. Reembolso pelo mesmo meio (10 dias cartão). Regras por produtor/cinema.
- **Atual (Lorde Nelson)**: Regras por evento (horas antes + % taxa) no admin. Solicitação manual → admin aprova. Sem menção clara ao CDC 7 dias. Sem reembolso automático via API em todos fluxos. Sem página pública clara.

**Alinhamento com CDC (Código de Defesa do Consumidor)**:
- Ambos líderes respeitam 7 dias de arrependimento para compras online.
- Nosso sistema deve exibir claramente a política e permitir cancelamento dentro dos prazos legais (auto ou com aprovação).

## 4. Sugestões de Melhorias (Priorizadas)

### Alta Prioridade (UX/Confiança/Políticas)
1. **Conta + Login para Clientes ("Meus Ingressos")**
   - Adicionar criação de conta (email + senha) ou login com Google/Apple.
   - "Meus Ingressos" persistente na conta (além do código de acesso).
   - Enviar email + código + link para "Meus Ingressos" após compra (como Sympla).
   - Manter acesso por código como guest fallback (bom para pub).

2. **Política Clara de Cancelamento (página dedicada)**
   - Criar `/politica-de-cancelamento` visível em todo fluxo (home, evento, checkout, ingressos).
   - Alinhar com CDC: 7 dias corridos + X horas antes do evento (definir por evento, ex: 12h + taxa 10%).
   - Exibir na página do evento e checkout.
   - Permitir auto-cancelamento quando elegível (com reembolso via gateway).

3. **Melhorar Fluxo de Cancelamento/Reembolso (real, por docs)**
   - Cliente solicita (se elegível via regras do evento) → status pending.
   - Admin aprova → **chamar API real de reembolso** (Stripe `refunds.create({payment_intent, amount})` ou MP `refunds`).
   - Atualizar status para 'refunded', enviar email com valor reembolsado.
   - Tratar webhooks de reembolso (Stripe `charge.refunded`, MP `payment.refunded`).
   - Exibir política e prazos claramente.

4. **Imagens e Apresentação Visual**
   - Substituir definitivamente picsum por assets reais ou Unsplash consistentes.
   - Melhorar página de evento (fotos grandes, mapa, regras visíveis, lotes se aplicável).

5. **Checkout mais completo**
   - Adicionar opção de parcelamento visível (se gateway suportar).
   - Permitir adicionar "produtos extras" (Sympla Store like) se relevante.
   - Melhor validação de CPF, email.
   - Mostrar resumo claro de taxas e política.

### Média Prioridade (Operacional/Técnico)
6. **Lotes e Tipos de Ingressos Avançados**
   - Suporte a lotes com datas de virada automática.
   - Grupos/subgrupos de ingressos.

7. **App-like para Clientes**
   - Melhorar /ingressos (PWA?).
   - Suporte a adicionar à carteira digital.
   - Check-in mais robusto.

8. **Fraud e Confiança**
   - Adicionar mais validações no checkout.
   - Logs de análise de risco.

9. **Admin / Produtor**
   - Melhor dashboard de vendas em tempo real.
   - Relatórios exportáveis.
   - Gestão de reembolsos mais clara (com valor calculado).
   - Info de repasse (mesmo que manual).

10. **Webhooks e Confiabilidade**
    - Garantir idempotência.
    - Melhor tratamento de falhas.

### Baixa Prioridade / Longo Prazo
- Integração com carteiras digitais.
- Suporte a meia-entrada/social com verificação (se aplicável).
- Análise de dados / BI para produtor.
- White-label ou customização mais profunda.
- Testes automatizados de fluxo de compra.

## 5. Plano Passo a Passo para Implementação

**Fase 1 - Imediato (1-2 semanas) - Base Legal e Confiança**
- [ ] Criar página `/politica-de-cancelamento` com texto claro alinhado CDC (7 dias + horas antes).
- [ ] Exibir link da política em todas páginas relevantes.
- [ ] Melhorar fluxo de solicitação de cancelamento (mostrar se elegível).
- [ ] Implementar reembolso real via APIs (Stripe + MP) no fluxo de aprovação admin.
- [ ] Atualizar emails de cancelamento com valor exato.
- [ ] Adicionar tratamento de webhooks de reembolso.

**Fase 2 - Experiência do Cliente (2-4 semanas)**
- [ ] Adicionar criação/login de conta para clientes (email + senha ou social).
- [ ] "Meus Ingressos" baseado em conta (além do código).
- [ ] Melhorar página de evento (imagens reais, política visível, lotes se aplicável).
- [ ] Substituir todas imagens demo por reais.

**Fase 3 - Técnico e Operacional (3-6 semanas)**
- [ ] Adicionar suporte a lotes com virada.
- [ ] Melhorar validação no checkout + adicionar parcelamento visual.
- [ ] Configurar webhooks corretamente com domínio real.
- [ ] Adicionar Zod validation em rotas críticas.
- [ ] Substituir `<img>` por `next/image` + remotePatterns.
- [ ] Adicionar connection pooling no Prisma para MySQL serverless.

**Fase 4 - Deploy e Prod (contínuo)**
- [ ] Migrar DB para Postgres ou MySQL hospedado (Neon/Railway/Aiven).
- [ ] Configurar variáveis de ambiente reais no Vercel (sem chaves no repo).
- [ ] Configurar webhooks reais nos dashboards de pagamento.
- [ ] Adicionar Sentry ou logging.
- [ ] Testes manuais completos do fluxo (compra → acesso → cancelamento → reembolso).
- [ ] Atualizar PRODUCTION_SETUP.md e este benchmark.

**Fase 5 - Avançado**
- [ ] App-like ou PWA melhorado.
- [ ] Adicionar produtos extras na compra.
- [ ] Dashboard admin mais rico.
- [ ] Testes automatizados.

## Próximos Passos Imediatos Recomendados
1. Criar a página de políticas de cancelamento clara.
2. Implementar o reembolso real no admin (usando as chaves fornecidas).
3. Adicionar fluxo de criação de conta para clientes.
4. Substituir imagens restantes.
5. Atualizar checkout com mais informações de política.

Este documento serve como referência para implementar aos poucos. Cada melhoria deve ser testada localmente + com as chaves de teste antes de ir para live.

Se quiser, podemos começar pela Fase 1 agora.