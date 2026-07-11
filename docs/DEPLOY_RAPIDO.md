# Deploy rápido no EasyPanel (sem rebuild no VPS)

## Problema

Build Docker **no VPS** (npm + next build) leva **10–20 min** e satura a máquina (tudo amarelo).

## Solução recomendada

1. **GitHub Actions** compila a imagem (CPU forte + cache GHA)  
2. Publica em **`ghcr.io/aerciompr/portal-lorde-ingresso:main`**  
3. EasyPanel só **baixa a imagem** e sobe o container → **~1–3 min**

Workflow: [`.github/workflows/docker-ghcr.yml`](../.github/workflows/docker-ghcr.yml)  
Roda a cada `push` em `main`.

---

## Configurar uma vez no EasyPanel

### Opção A — Source: Docker Image (melhor)

1. App → **Source** / **Provider**  
2. Escolha **Docker Image** (não “GitHub + Dockerfile”)  
3. Image:

```text
ghcr.io/aerciompr/portal-lorde-ingresso:main
```

4. Port: `3000`  
5. Mesmas env vars de sempre (`DATABASE_URL`, secrets, `PRISMA_USE_ADAPTER=0`, …)  
6. Se a imagem GHCR for **privada**:
   - GitHub → Package → Package settings → Change visibility → **Public**, **ou**
   - EasyPanel registry login com PAT `read:packages`

### Opção B — Continuar com GitHub + Dockerfile

Continua buildando **no VPS** (lento). Use só se não puder puxar do GHCR.

---

## Fluxo do dia a dia

```text
git push origin main
  → GitHub Actions builda imagem (~5–8 min no GH, sem travar VPS)
  → EasyPanel: Deploy / Pull latest  (~1–2 min)
```

No EasyPanel, se houver “Redeploy” / “Pull”: use isso após o Actions ficar **verde**.

Checklist:

1. [ ] Actions “Docker image (GHCR)” passou no último commit  
2. [ ] App aponta para `ghcr.io/aerciompr/portal-lorde-ingresso:main`  
3. [ ] Pull/Deploy no EasyPanel  

---

## Quando NÃO precisa redeploy

| Mudança | Ação |
|---------|------|
| Só env (`ADMIN_PASSWORD`, chaves MP…) | **Restart** do container |
| Só conteúdo no admin | Nada (já está no MySQL) |
| Código / Dockerfile | Push → wait Actions → Pull imagem |

---

## Imagem e tags

| Tag | Uso |
|-----|-----|
| `main` / `latest` | produção |
| `sha-<commit>` | pin de versão / rollback |

Exemplo rollback:

```text
ghcr.io/aerciompr/portal-lorde-ingresso:sha-fd7bf89
```

---

## Ver se a imagem existe

https://github.com/aerciompr/portal-lorde-ingresso/pkgs/container/portal-lorde-ingresso  

Ou:

```bash
docker pull ghcr.io/aerciompr/portal-lorde-ingresso:main
```
