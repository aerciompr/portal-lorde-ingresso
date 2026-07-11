# Imagens que **não somem** no deploy

## Resposta curta

**Sim — pelo Environment (env), sem montar volume:**

```env
UPLOAD_STORAGE=db
```

As imagens vão para a tabela **`MediaFile` no MySQL**.  
O MySQL **já é persistente** no EasyPanel → deploy **não apaga** as fotos.

URL pública: `/uploads/m/{id}`

---

## Opções (`UPLOAD_STORAGE`)

| Valor | Onde grava | Some no deploy? | Precisa volume? |
|-------|------------|-----------------|-----------------|
| **`db`** (padrão no Docker) | MySQL | **Não** | Não |
| `disk` | Pasta `/app/data/uploads` | **Sim**, sem volume | Sim, se quiser manter |
| `auto` | Disco se der; senão MySQL | Depende | Opcional |

No EasyPanel → Environment do app:

```env
UPLOAD_STORAGE=db
```

(O Dockerfile já define isso; confira se não sobrescreveu com outra coisa.)

---

## Depois do deploy (obrigatório uma vez)

Criar a tabela no banco — **Console** do container:

```bash
npx prisma db push --schema=./prisma/schema.prisma
```

Deve aparecer sync OK. Sem isso o upload em modo `db` falha.

---

## Volume no EasyPanel (opcional)

Só se quiser `UPLOAD_STORAGE=disk` com pasta no servidor:

- Mount path: `/app/data/uploads`
- Env: `UPLOAD_STORAGE=disk` + `UPLOADS_DIR=/app/data/uploads`

Para o dia a dia do portal, **`db` é mais simples** e não depende de volume.

---

## Checklist

- [ ] Env `UPLOAD_STORAGE=db`  
- [ ] Deploy do `main`  
- [ ] `prisma db push` no console  
- [ ] Upload no admin → URL tipo `/uploads/m/clxxxxxxxx`  
- [ ] Novo deploy → imagem **ainda** abre  

---

## Fotos antigas em `/uploads/1783....jpg` (disco)

Essas eram só no container e **já se perderam** se houve deploy.  
Reenvie no admin (agora grava no MySQL).
