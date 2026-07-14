# Migração WooCommerce → Portal (eventos ativos)

**Escopo atual**

| Filtro | Valor |
|--------|--------|
| Eventos | Só **publicados** no site (`post_status = publish`) |
| Data | Início do evento **≥ 14/07/2026** (`2026-07-14`) |
| Lotes | Só dos eventos acima |
| Pedidos | Só itens de ingresso desses eventos |

Para mudar a data, altere `2026-07-14` nos 3 arquivos SQL em `scripts/export-woo/`.

Se as tabelas WP usarem outro prefixo (`wp2_`), troque `wp_` por `wp2_` em todo o SQL.

---

## Ordem (não inverter)

```
1. eventos.csv  →  2. lotes.csv  →  3. pedidos.csv
```

1. Exportar no **MySQL do WordPress** (phpMyAdmin)  
2. CSV **UTF-8 com cabeçalho**  
3. Portal: **Admin → Importação CSV**

Pedidos importados ficam com:

- `source = woocommerce`  
- `allowClientCancel = false` (cliente não cancela sozinho no portal)

---

## PARTE A — Exportar no WordPress

### A1 · Eventos → `eventos.csv`

1. Abra `scripts/export-woo/01_eventos.sql`  
2. Cole no phpMyAdmin do site antigo → **Executar**  
3. Confira se a lista é só o que está **no site / a partir de 14/07**  
4. Exportar → **CSV** → salve como **`eventos.csv`**

Colunas: `external_id`, `title`, `slug`, `date`, `open_time`, `address`, `description`, `image_url`

### A2 · Lotes → `lotes.csv`

1. `scripts/export-woo/01b_lotes.sql`  
2. Executar → Exportar CSV → **`lotes.csv`**

Colunas: `product_external_id`, `event_external_id`, `nome`, `price`, `capacity`, `stock`, `sold_out`, `sold`, …

### A3 · Pedidos → `pedidos.csv`

1. `scripts/export-woo/02_pedidos.sql`  
2. Executar → Exportar CSV → **`pedidos.csv`**  
3. Só linhas de clientes desses eventos ativos (completed / processing / refunded)

---

## PARTE B — Importar no portal

URL: `/admin/importacao` (login admin)

### B1 · Eventos + fotos

1. Aba **1. Eventos + fotos**  
2. Escolher `eventos.csv`  
3. **Pré-visualizar**  
4. Marcar **Baixar fotos dos eventos**  
5. **Importar**  
6. Conferir **Admin → Eventos**

### B2 · Lotes / estoque

1. Aba **2. Lotes / preços**  
2. `lotes.csv` → **Pré-visualizar** → **Importar**  
3. Conferir preço, estoque e lotes esgotados (ficam inativos)

### B3 · Pedidos

1. Aba **3. Pedidos vendidos**  
2. `pedidos.csv` → **Pré-visualizar** → **Importar**  
3. Conferir **Pedidos**, **Clientes**, **Meus Ingressos** (e-mail real)

---

## Checklist

- [ ] SQL eventos: só publish + ≥ 14/07/2026  
- [ ] Contagem de eventos bate com o site  
- [ ] Lotes com preço/estoque coerentes  
- [ ] Pedidos só desses eventos  
- [ ] Fotos baixadas (ou URL ok)  
- [ ] Teste Meus Ingressos com 1 e-mail de cliente  
- [ ] Pedido migrado **sem** cancelamento self-service  

---

## Problemas comuns

| Problema | Solução |
|----------|---------|
| Ainda vem evento antigo | Confirme o filtro `2026-07-14` no SQL e `post_status = publish` |
| Table doesn't exist | Prefixo `wp_` vs `wp2_` |
| 0 linhas em lotes/pedidos | Evento sem `_tribe_wooticket_for_event` ou sem `wp_tec_events` |
| Acentos errados | CSV UTF-8 |
| Pedido duplicado | Mesmo `external_id` — import ignora (ou use “substituir”) |
| `end_date` erro no SQL | Remova o bloco `AND ( e.end_date … )` se a coluna não existir na sua versão TEC |

---

## Arquivos

| Arquivo | Uso |
|---------|-----|
| `scripts/export-woo/01_eventos.sql` | Eventos ativos ≥ 14/07 |
| `scripts/export-woo/01b_lotes.sql` | Lotes desses eventos |
| `scripts/export-woo/02_pedidos.sql` | Pedidos desses eventos |
| `app/admin/importacao/page.tsx` | UI import |
| `docs/MIGRACAO_CSV_WOOCOMMERCE.md` | Este guia |

---

## Depois da migração

- Novas vendas no **portal** (desative checkout Woo quando estiver confiante)  
- Stripe: webhook + **Sincronizar Stripe** / **Rodar crons** no admin  
- Pixel: **Configurações → Marketing**
