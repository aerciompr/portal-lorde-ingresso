# Passo a passo: imagens em **volume** (EasyPanel)

Assim as fotos **não somem** quando você clica em **Implantar**.

---

## Ideia

```text
Container do app (pode ser recriado)
        │
        │  monta
        ▼
Volume "portal_uploads"  ←── fica no disco da VPS (permanente)
caminho: /app/data/uploads
```

Código grava em: `/app/data/uploads`  
Env: `UPLOAD_STORAGE=disk`

---

## Passo 1 — Environment do app

1. EasyPanel → projeto → serviço **portal_lorde_next** (App, não o MySQL)  
2. Aba **Environment** / **Env**  
3. Confira ou adicione (sem aspas):

```env
UPLOAD_STORAGE=disk
UPLOADS_DIR=/app/data/uploads
```

4. **Salve**

---

## Passo 2 — Criar o volume (o mais importante)

1. Ainda no serviço do **App**  
2. Procure uma destas abas (o nome muda um pouco conforme a versão do EasyPanel):

   - **Mounts**  
   - **Volumes**  
   - **Storage**  
   - **Disk**  
   - **Advanced** → Mounts  

3. Clique em **Add** / **+ Mount** / **Add volume**  

4. Preencha assim:

| Campo (pode ter nome parecido) | O que colocar |
|--------------------------------|---------------|
| **Type** | Volume (não “bind” de pasta do host, se não souber o path) |
| **Volume name** / Name | `portal_uploads` |
| **Mount path** / Container path / Destination | `/app/data/uploads` |
| **Read only** | **Não** (desmarcado) |

5. **Salve** o mount  

### Se o EasyPanel pedir “Source” e “Target”

- **Target / Container:** `/app/data/uploads`  
- **Source / Volume:** crie ou escolha `portal_uploads`

### Se só tiver “Bind mount”

- Host path: algo como `/etc/easypanel/projects/.../uploads` (o painel sugere)  
- Container path: `/app/data/uploads`  
- Também serve, desde que o path do host **não** mude a cada deploy  

---

## Passo 3 — Subir de novo o app

1. **Deploy** / **Implantar** **ou** **Restart** (se só mudou env + mount)  
2. Espere o serviço ficar **verde** / Running  

No log de start deve aparecer algo como:

```text
[entrypoint] UPLOADS_DIR=/app/data/uploads files=0
```

(`files=0` na primeira vez é normal.)

---

## Passo 4 — Testar se grava

1. Admin → evento → **Enviar imagem**  
2. Console do container:

```bash
ls -la /app/data/uploads
```

Deve listar o arquivo (ex. `1783....jpg`).

3. Abra a URL da imagem no site (ex. `https://portal.lordenelson.com.br/uploads/...`) — deve carregar.

---

## Passo 5 — Testar se **não some** no deploy

1. Anote o nome de um arquivo do `ls`  
2. EasyPanel → **Implantar** de novo  
3. Console de novo:

```bash
ls -la /app/data/uploads
```

O arquivo **tem** que continuar.  

- Se sumiu → o mount **não** está ligado nesse serviço (refaça o Passo 2 no **App** certo).  
- Se ficou → está em produção de verdade.

---

## Checklist

- [ ] Env `UPLOAD_STORAGE=disk`  
- [ ] Env `UPLOADS_DIR=/app/data/uploads`  
- [ ] Volume montado em `/app/data/uploads`  
- [ ] Restart/Deploy  
- [ ] Upload + `ls` mostra arquivo  
- [ ] Novo Implantar + `ls` **ainda** mostra o arquivo  

---

## Problemas comuns

| Sintoma | O que fazer |
|---------|-------------|
| Upload EACCES / sem permissão | Volume root-only: Restart; entrypoint dá `chmod`. Ou deixe o mount e reinicie. |
| Upload ok, some no deploy | Volume não montado ou path errado (tem que ser **exato** `/app/data/uploads`) |
| `ls` vazio sempre | Você está no console do **MySQL** sem querer — use o do **App** |
| Imagens antigas sumiram | Não voltam; reenvie depois do volume ativo |
| Quero voltar pro MySQL | `UPLOAD_STORAGE=db` + `prisma db push` (tabela MediaFile) |

---

## O que **não** fazer

- Não monte volume em `/app` inteiro (quebra o código do container)  
- Não use `UPLOAD_STORAGE=db` e volume ao mesmo tempo “sem saber” — escolha **um** modo  
- Não apague o volume `portal_uploads` no painel (apaga as fotos)

---

## Resumo de 4 linhas

1. Env: `UPLOAD_STORAGE=disk` e `UPLOADS_DIR=/app/data/uploads`  
2. Mount: volume → `/app/data/uploads`  
3. Deploy/Restart  
4. Upload → `ls` → Deploy de novo → `ls` de novo (arquivos ainda lá)  
