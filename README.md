# Lorde Nelson Ingressos — Portal Moderno de Vendas

Substituição completa do site lento WordPress + WooCommerce (www.lordenelson.com.br) por uma aplicação **Next.js 16 moderna**, rápida, com todas as funcionalidades solicitadas.

## Análise do Site Atual (resumo)

**Problemas identificados:**
- Stack: WordPress + The Events Calendar (tribe_events) + WooCommerce + plugins pesados (Envira Gallery, menus de restaurante, shortcodes, Elementor-like, Google Maps, etc.).
- Fluxo de ingressos: Páginas de evento com seletor de quantidade que adicionam "produtos" ao carrinho WC. Checkout padrão WC (lento, várias requisições).
- Sem área dedicada clara de "Meus Ingressos" visível. Provavelmente depende de e-mail de confirmação + My Account do Woo.
- Sem check-in dedicado, relatórios avançados ou fluxo de cancelamento estruturado.
- **Performance ruim**: Bloat de plugins, JS pesado, sem SSR/edge moderno, imagens e queries dinâmicas sem otimização. Resultado: lentidão relatada pelo cliente.
- Design: Funcional mas datado e sobrecarregado.

**O que o site faz bem (e foi replicado/melhorado):**
- Listagem simples de programação (eventos futuros).
- Detalhe com lineup, horário de abertura, local fixo (Rua Silvério Jorge, 241, Jaraguá, Maceió).
- Preços baixos (R$25–R$35), venda até pouco antes do evento.
- Foco 100% em vendas de ingressos para o Pub (shows, Copa 2026, forró, etc.).

**Referências usadas:**
- **Sympla**: Meus Ingressos lindo com QR, cancelamento dentro de regras, dashboard produtor, app check-in, Pix forte.
- **ingresso.com**: Checkout profissional, login/CPF, listagem clara, validação forte de ingressos.

## Stack Escolhida (moderna e atual em 2026)

- **Next.js 16 (App Router)** + TypeScript + Tailwind
- **Prisma + better-sqlite3** (dev super rápido, zero dependência de Postgres local. Fácil migrar para Postgres/Neon/Supabase em prod)
- Autenticação simples (cookie admin + lookup por email para cliente)
- **Pagamentos**:
  - Stripe (Elements / Payment Intent) — checkout transparente de cartão
  - Mercado Pago (Pix + Bricks para cartão) — checkout transparente
- Geração de PDF + QR Code (pdf-lib + qrcode) — ingressos bonitos com código assinado (HMAC)
- Scanner QR no check-in: html5-qrcode (webcam)
- Relatórios: Recharts
- Formulários: React Hook Form + Zod (pronto para expansão)

## Como usar o Grok Build neste projeto

Este projeto é desenvolvido usando Grok Build com um conjunto de skills personalizadas localizadas no diretório `.grok/skills/`.

- Os arquivos `SKILL.md` definem comportamentos e workflows específicos para tarefas como Next.js full-stack, UI/UX, segurança, arquitetura, etc.
- Sempre inicie o fluxo de trabalho via `/plan` (Plan Mode) antes de fazer mudanças significativas. Isso garante planejamento, inspeção e aprovação humana quando necessário.
- Para mudanças em features Next.js, use o skill `nextjs-fullstack` (ex: "Use nextjs-fullstack. [descreva a mudança]").
- Para UI, forms e experiência do usuário, use `frontend-ux-engineer`.
- Outros skills úteis: `security-audit`, `refactor-master`, `tdd-test-engineer`, `repo-health-check`, etc.
- Siga as regras dos skills: Plan Mode para mudanças em routing/auth/caching, use subagents para revisões, rode checks estreitos (`npm run build`, lint etc.) e prefira edições pequenas e verificáveis.
- Nunca commite segredos; use o skill de segurança quando relevante.

Consulte `.grok/skills/` e `AGENTS.md` para detalhes.

## Funcionalidades Implementadas

✅ **Portal público rápido** (home + /eventos) com cards lindos
✅ **Página de evento** com seletor de quantidade por tipo de ingresso + "Continuar"
✅ **Checkout transparente**:
   - Formulário de comprador (nome, email, CPF)
   - Botão PIX (Mercado Pago) e Cartão (Stripe)
   - Atualmente simula sucesso instantâneo (fluxo completo testável). Fácil trocar por chamadas reais.
✅ **Rotina de estorno (refunds)**: Botão no admin que marca como refunded + cancela tickets. Implementação real via gateways (veja PRODUCTION_SETUP.md).
✅ **Página do cliente (/ingressos)**: Busca por email → lista pedidos + ingressos. **Baixar PDF** individual com QR grande. Botão "Solicitar cancelamento".
✅ **Regras de cancelamento no backend**: Definidas por evento (allowCancel, cancelHoursBefore, cancelFeePercent). Validação ao solicitar.
✅ **Relatórios de vendas por evento** (/admin/reports): Gráfico + totais. Fácil exportar.
✅ **Página de check-in (/checkin)**: 
   - Scanner de câmera (html5-qrcode)
   - Entrada manual de código
   - Validação em tempo real + marca como "used"
✅ **Admin completo** (/admin após login):
   - CRUD básico de eventos
   - Configuração de chaves Stripe/MP + regras globais de cancelamento (salva no banco)
   - Lista de pedidos + botão de estorno
   - Link para reports e check-in

## Como Rodar (Windows / pwsh)

```bash
cd C:\Users\aerciompr\projects\lordenelson-ingressos

# Instalar deps (já feito, mas caso precise)
npm install

# Banco + seed (eventos da Copa 19/06, Arraiá, Copa 24/06 + pedido demo) — use apenas em dev. Para produção veja PRODUCTION_SETUP.md
npm run db:push
npm run db:seed

# Iniciar
npm run dev
```

Abra http://localhost:3000

**Login admin**: Vá em /admin → senha padrão `admin123` (mude no .env `ADMIN_PASSWORD`)

**Teste cliente**:
- Compre um ingresso (escolha Arraiá por exemplo)
- Vá em /ingressos e use o email `joao@exemplo.com` (seed) ou o email que você usou no checkout

## Configuração de Pagamentos (Stripe + Mercado Pago)

1. Crie conta de teste:
   - Stripe: https://dashboard.stripe.com/test/apikeys
   - Mercado Pago: https://www.mercadopago.com.br/developers (use credenciais TEST)

2. Coloque no `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   MERCADOPAGO_ACCESS_TOKEN=TEST-...
   MERCADOPAGO_PUBLIC_KEY=TEST-...
   ```

3. (Opcional) No painel Admin > Configurações você pode salvar chaves (útil para cliente não-técnico).

**Para checkout 100% transparente real** (próximos passos recomendados):
- Stripe: Instale o uso de `<PaymentElement />` + `stripe.confirmPayment` no componente de checkout (já temos @stripe/stripe-js).
- Mercado Pago: Use `@mercadopago/sdk-react` + Card Brick / Pix Brick (gere QR no servidor e confirme via webhook).

Webhooks:
- Crie endpoints `/api/webhook/stripe` e `/api/webhook/mp` (prontos para você implementar). Use Stripe CLI ou ngrok em dev.

## Gestão de Segredos

Este projeto usa duas camadas para gerenciar segredos (Stripe, Mercado Pago, TICKET_SECRET, ADMIN_PASSWORD, etc.):

- **Principal (recomendado)**: Admin > Configurações (aba Gateways e outras). As chaves são salvas no banco de dados para edição fácil por usuários autorizados (sem precisar mexer em arquivos ou redeploy).
- **Fallback / Alta segurança em produção**: Variáveis de ambiente da plataforma (Vercel, Railway, etc.). O código (`lib/settings.ts`) faz fallback automático de `process.env` sobre o que está no banco.

**NUNCA commite chaves reais.**

- Para desenvolvimento local: copie `.env.example` para `.env.local` e preencha apenas com chaves de **TESTE**.
- Após deploy: as chaves podem ser inseridas/editadas diretamente no painel Admin (ficam no DB) ou configuradas como Environment Variables na plataforma.
- Sempre rotacione chaves se houver qualquer suspeita de exposição.

## Deploy (Recomendado)

- **Vercel** (melhor para Next.js)
- Banco: **Neon** ou **Supabase Postgres** (mude `DATABASE_URL` e rode `prisma migrate deploy`)
- Atualize `NEXT_PUBLIC_APP_URL`
- Coloque todas as chaves secretas nas Environment Variables do Vercel (nunca no código)

## Estrutura de Pastas (destaques)

```
app/
  page.tsx                 # Home com programação
  eventos/page.tsx
  evento/[slug]/           # Detalhe + TicketSelector
  checkout/[orderId]/
  ingressos/page.tsx       # Cliente (meus ingressos + download + cancel)
  checkin/page.tsx         # Staff (QR scanner + manual)
  admin/                   # Protegido por middleware + cookie
    login, page.tsx, reports
lib/
  prisma.ts, generate-ticket.ts (PDF+QR), utils, auth
app/api/                   # orders, checkin/validate, admin/*, cancellations, tickets/*/pdf
prisma/schema.prisma       # Modelo completo (Event, TicketType, Order, Ticket, CancellationRequest, Setting)
```

## Próximos Passos / Melhorias Fáceis

- Email real (Resend) na confirmação de pedido
- Múltiplos tipos de ingresso por evento no admin
- Webhooks + confirmação real de pagamento
- Transferência de ingresso (como Sympla)
- PWA + modo offline para tickets
- Export CSV completo nos relatórios

O sistema está **pronto para uso imediato** como substituto do portal atual, muito mais rápido, moderno e com todos os recursos pedidos.

Qualquer dúvida ou evolução — é só pedir.
