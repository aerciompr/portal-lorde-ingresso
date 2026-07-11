# Benchmark Sympla vs Ingresso.com vs Lorde Nelson Ingressos
**Data da análise:** Junho 2026
**Objetivo:** Comparar fluxos de compra, políticas e experiência do usuário para alinhar o projeto Lorde Nelson Ingressos com os líderes de mercado no Brasil.

## 1. Estudo Sympla (sympla.com.br)

### Fluxo de Compra Completo (até finalização)
1. **Descoberta:** Busca por eventos (cidade, data, categoria, palavra-chave). Filtros avançados.
2. **Página do Evento:**
   - Título, data/horário, local (mapa), descrição, fotos/vídeos.
   - Ingressos por **lotes** (com virada automática de preço).
   - Tipos de ingressos (inteira, meia, grupos, subgrupos).
   - Quantidade, adicionar ao carrinho.
   - Regras de meia-entrada, política de cancelamento visíveis.
3. **Carrinho / Seleção:**
   - Resumo de itens.
   - Opção de adicionar "Sympla Store" (produtos extras) **durante** a compra de ingressos.
4. **Dados do Comprador:**
   - Nome, email, CPF (obrigatório em muitos casos), telefone.
   - Criação de conta ou login (email, Google SSO, SMS, WhatsApp code).
5. **Pagamento:**
   - Cartão de crédito (parcelamento), Pix, boleto, Google Pay, Apple Pay.
   - Análise de risco/fraude automática.
6. **Confirmação:**
   - Pagamento aprovado → Ingressos gerados automaticamente.
   - Envio por email (PDF + QR).
   - Disponível imediatamente na **Carteira do App Sympla** (melhor experiência).
   - Check-in via app (QR scan) ou impressão.
7. **Pós-Compra ("Meus Ingressos"):**
   - App Sympla é o centro: ingressos offline, histórico, check-in.
   - Site: Login → "Meus Ingressos" ou "Carteira".
   - Suporte a digital wallet em alguns casos.

### Políticas Principais
- **Cancelamento (CDC - Código de Defesa do Consumidor):**
  - Até **7 dias corridos** após a compra.
  - + Até **48 horas antes** do evento (se dentro dos 7 dias).
  - Reembolso automático em muitos casos (desconta taxa de serviço em alguns cenários).
  - Produtor pode definir política própria (deve ser clara).
  - Pedido via plataforma ou suporte (titular da compra).
- **Repasse ao Produtor:** 3º dia útil após o evento (via transferência bancária).
- **Taxas:** ~10% para presenciais.
- **Fraud e Análise:** Forte análise de risco + processadores de pagamento.
- **LGPD/Privacidade:** Dados usados para emissão de ingressos e comunicação.
- **Ingressos:** QR code no app ou PDF. Check-in mobile.

**Destaques UX:**
- App nativo excelente para portabilidade e check-in.
- Lotes e virada de preço.
- Compra de produtos adicionais integrada.
- Login flexível (código por SMS/WhatsApp/Email, Google).
- Parcelamento para comprador, repasse integral rápido para produtor.

## 2. Estudo Ingresso.com

### Fluxo de Compra Completo
1. **Descoberta:** Busca por filmes/eventos, cinemas, datas. Filtros por localização.
2. **Página do Evento/Sessão:**
   - Detalhes, horários/sessões, trailers.
   - Seleção de assentos (para cinema/teatro).
   - Tipos: inteira, meia-entrada, etc.
3. **Seleção e Carrinho:**
   - Quantidades, tipos de ingresso.
   - Resumo.
4. **Dados do Comprador:**
   - Nome, email, CPF (muito enfatizado), telefone.
   - Criação de conta ou login (email/senha ou social?).
5. **Pagamento:**
   - Cartão, Pix, boleto, etc.
   - Análise de risco.
6. **Confirmação:**
   - Ingressos no "Meus Pedidos".
   - Email + PDF/QR ou acesso via conta.
   - Para cinema: integração com apps de cinema.
7. **Pós-Compra:**
   - "Meus Pedidos" ou conta para acessar ingressos.
   - QR code para entrada.
   - Cancelamento via "Meus Pedidos" (limitado).

### Políticas Principais
- **Cancelamento:**
  - Direito de arrependimento: até **7 dias corridos** da compra (se sessão >7 dias à frente).
  - Para sessões próximas: até 1 hora antes em alguns casos.
  - Limite: até 4 cancelamentos por mês por usuário.
  - Reembolso pelo mesmo método (cartão: até 10 dias úteis; Pix/boleto: conta de origem).
  - Cancelamento só pelo titular via plataforma ou atendimento.
  - Regras específicas por cinema/produtor (ex: Cinépolis via Ingresso.com).
- **Reembolsos:** Apenas valor do ingresso (taxa administrativa pode ser retida em alguns casos). Integral se cancelamento pelo produtor.
- **Fraude:** Análise pelo processador de pagamento.
- **LGPD:** Padrão.

**Destaques UX:**
- Forte em seleção de assentos.
- Integração com redes de cinema.
- "Meus Pedidos" claro.
- Limites claros de cancelamento para evitar abuso.

## 3. Comparação com o Atual Lorde Nelson Ingressos

### Fluxo de Compra Atual (baseado no código)
- Home com lista de eventos (próximos).
- Página de evento: detalhes + seletor de quantidades por tipo.
- Checkout: formulário buyer (nome, email, CPF, telefone) → escolha Pix/Cartão → pagamento transparente (Stripe/MP).
- Confirmação: redirect para /ingressos com email + accessCode.
- Acesso pós-compra: /ingressos (email + código ou login localStorage) → lista de pedidos + QR + PDF download + solicitar cancelamento.
- Check-in: página separada com scanner QR + manual.
- Admin: CRUD básico eventos, pedidos, configurações de cancelamento, reembolsos manuais.

**Pontos Fortes Atuais vs Plataformas:**
- Checkout transparente e simples (guest-friendly).
- AccessCode + email para "Meus Ingressos" sem cadastro obrigatório (bom para pub pequeno).
- QR assinado com HMAC (boa antifraude básica).
- Suporte real a Pix (MP) + Cartão + webhooks.
- Regras de cancelamento por evento (horas + taxa %).

**Gaps vs Sympla/Ingresso.com:**
- **Sem conta/login real para clientes:** Apenas código de acesso ou localStorage. Sympla/Ingresso têm "Meus Ingressos" com conta (email/senha ou SSO).
- **Sem app ou experiência mobile-first dedicada:** Sympla tem app excelente para carteira offline e check-in.
- **Sem lotes/virada de preço:** Sympla usa lotes fortemente.
- **Cancelamento:** Atual é request → admin aprova manual (bom), mas sem reembolso automático via gateway em todos casos, sem política clara visível, sem integração forte com CDC 7 dias.
- **Sem parcelamento visível para comprador** (Sympla destaca).
- **Sem integração de produtos extras** durante compra.
- **Imagens e UX:** Ainda usa picsum em alguns lugares; checkout menos polido que os líderes.
- **Políticas:** Não tem página clara de "Políticas de Cancelamento" alinhada com CDC como eles têm.
- **Check-in:** Funcional, mas Sympla/Ingresso têm apps mais robustos.
- **Fraud/Confiança:** Menos análise avançada visível.
- **Repasse (para produtor):** Não há menção clara (Sympla tem repasse em 3 dias).

### Políticas de Cancelamento
- **Sympla:** 7 dias corridos após compra + 48h antes do evento. Reembolso automático em muitos casos. Produtor define + divulga.
- **Ingresso.com:** 7 dias (se sessão distante), limite 4x/mês. Reembolso pelo mesmo meio (10 dias cartão). Regras por produtor/cinema.
- **Atual (Lorde Nelson):** Regras por evento (horas antes + % taxa). Request manual via app → admin aprova. Sem menção clara ao CDC 7 dias. Sem reembolso automático via API em todos fluxos.

**Alinhamento com CDC (Código de Defesa do Consumidor Brasil):**
- Ambos líderes respeitam 7 dias de arrependimento para compras online.
- Nosso sistema deve exibir claramente a política e permitir cancelamento dentro dos prazos legais.

## 4. Sugestões de Melhorias (Priorizadas)

### Alta Prioridade (UX/Confiança do Comprador)
1. **Conta + Login para Clientes (Meus Ingressos)**
   - Adicionar criação de conta (email + senha) ou login com Google/Apple.
   - "Meus Ingressos" persistente na conta (além do código de acesso).
   - Enviar email + código + link para "Meus Ingressos" após compra (como Sympla).
   - Manter acesso por código como guest fallback.

2. **Política Clara de Cancelamento (página dedicada)**
   - Criar `/politica-cancelamento` visível em todo fluxo.
   - Alinhar com CDC: 7 dias corridos + X horas antes do evento (definir por evento).
   - Exibir na página do evento e no checkout.
   - Permitir auto-cancelamento quando elegível (com reembolso via gateway).

3. **Melhorar Fluxo de Cancelamento/Reembolso**
   - Cliente solicita cancelamento (se elegível) → status pending.
   - Admin aprova → **chamar API real de reembolso** (Stripe refunds.create / MP refunds).
   - Atualizar status para 'refunded', enviar email com valor reembolsado.
   - Tratar webhooks de reembolso (Stripe `charge.refunded`, MP payment.refunded).
   - Exibir política e prazos claramente.

4. **Imagens e Apresentação Visual**
   - Substituir definitivamente picsum por assets reais ou Unsplash consistentes.
   - Melhorar página de evento (fotos grandes, mapa, regras visíveis).
   - Adicionar lotes com virada de preço (como Sympla).

5. **Checkout mais completo**
   - Adicionar opção de parcelamento visível (se gateway suportar).
   - Permitir adicionar "produtos extras" (Sympla Store like) se relevante (bebidas, etc.).
   - Melhor validação de CPF, email, etc.
   - Mostrar resumo claro de taxas.

### Média Prioridade (Operacional e Técnico)
6. **Lotes e Tipos de Ingressos Avançados**
   - Suporte a lotes com datas de virada automática.
   - Grupos/subgrupos de ingressos.

7. **App-like para Clientes**
   - Melhorar /ingressos (PWA?).
   - Suporte a adicionar à carteira digital (se possível).
   - Check-in mais robusto (já tem scanner).

8. **Fraud e Confiança**
   - Adicionar mais validações no checkout (CPF format, email verify).
   - Análise de risco mais visível ou logs.

9. **Admin / Produtor**
   - Melhor dashboard de vendas em tempo real.
   - Relatórios exportáveis.
   - Gestão de reembolsos mais clara (com valor calculado).
   - Repasse info (mesmo que manual).

10. **Webhooks e Confiabilidade**
    - Garantir idempotência.
    - Melhor tratamento de falhas em webhooks.
    - Logs e retry.

### Baixa Prioridade / Longo Prazo
- Integração com carteiras digitais.
- Suporte a meia-entrada/social com verificação.
- Análise de dados / BI para produtor.
- White-label ou customização mais profunda.
- Testes automatizados de fluxo de compra.

## 5. Plano Passo a Passo para Implementação

**Fase 1 - Imediato (1-2 semanas) - Base Legal e Confiança**
- [ ] Criar página `/politica-de-cancelamento` com texto claro alinhado CDC (7 dias + horas antes).
- [ ] Exibir link da política em todas páginas relevantes (evento, checkout, ingressos).
- [ ] Melhorar fluxo de solicitação de cancelamento (mostrar se elegível).
- [ ] Implementar reembolso real via APIs (Stripe + MP) no fluxo de aprovação admin.
- [ ] Atualizar emails de cancelamento com valor exato reembolsado.
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

Se quiser, podemos começar pela Fase 1 (políticas + reembolso real) agora.

Documentação salva em: docs/COMPETITOR_BENCHMARK_AND_IMPROVEMENTS.md (adicionei aqui também para referência).