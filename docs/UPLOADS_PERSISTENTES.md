# Imagens que **não somem** no deploy (EasyPanel)

## Por que some?

Cada **Implantar** recria o **container**.  
Tudo que está **só dentro** do container (sem volume) é **apagado**.

As fotos do admin vão para disco do container → **sem volume = perde no próximo deploy**.

O banco MySQL **não** some (é outro serviço). Só as pastas de arquivo.

---

## Solução (uma vez) — volume no EasyPanel

### 1. Environment do app

Confirme (ou adicione):

```env
UPLOADS_DIR=/app/data/uploads
```

### 2. Montar volume (obrigatório em produção)

No EasyPanel, no serviço **portal_lorde_next** (o App):

1. Abra o serviço  
2. Procure **Mounts**, **Volumes**, **Storage** ou **Persistência**  
3. **Add mount / Add volume**  
4. Preencha:

| Campo | Valor |
|--------|--------|
| **Mount path** / Caminho no container | `/app/data/uploads` |
| **Volume name** (se pedir) | `portal_uploads` (qualquer nome fixo) |

5. **Salve**  
6. **Implantar** ou **Restart** uma vez  

A partir daí, os arquivos em `/app/data/uploads` **ficam no volume** e **sobrevivem** a deploys.

### 3. Conferir

No **Console** do container:

```bash
echo "UPLOADS_DIR=$UPLOADS_DIR"
ls -la /app/data/uploads
```

Depois de um upload no admin, o arquivo deve aparecer no `ls`.  
Faça um deploy de novo e rode `ls` outra vez — o arquivo **deve continuar**.

---

## O que **não** resolve

| Ação | Resultado |
|------|-----------|
| Só mudar pasta no código | Continua apagando sem volume |
| Salvar em `public/uploads` sem volume | Mesmo problema |
| Volume no MySQL | Não guarda as imagens do site |

---

## Imagens que já sumiram

Não voltam sozinhas. Depois do volume:

1. Reenvie as imagens no admin (evento / logo)  
2. Ou coloque URL externa (WordPress, CDN) no campo de imagem  

---

## Produção “séria” (opcional, futuro)

Volume no VPS resolve bem para 1 servidor.  
Se um dia tiver vários containers ou backup na nuvem: S3, Cloudflare R2, etc.  
Por enquanto **volume EasyPanel em `/app/data/uploads` é o caminho certo**.

---

## Checklist rápido

- [ ] Env `UPLOADS_DIR=/app/data/uploads`  
- [ ] Volume montado em `/app/data/uploads`  
- [ ] Restart/Deploy após criar o volume  
- [ ] Upload de teste + `ls` no console  
- [ ] Novo deploy + `ls` de novo (arquivo ainda lá)  
