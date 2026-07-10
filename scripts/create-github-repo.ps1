# Cria o repositório privado portal-lorde-ingresso e faz push da branch main.
# Pré-requisito: gh auth login (token válido)

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

Write-Host "==> Verificando autenticacao GitHub..." -ForegroundColor Cyan
gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Faca login: gh auth login -h github.com -p https -w" -ForegroundColor Yellow
  exit 1
}

$repoName = "portal-lorde-ingresso"
$user = (gh api user --jq .login 2>$null)
if (-not $user) {
  Write-Host "Nao foi possivel obter o usuario logado." -ForegroundColor Red
  exit 1
}
Write-Host "==> Usuario: $user" -ForegroundColor Cyan

# Verifica se o repo ja existe (exit 0 = existe)
$ErrorActionPreference = "SilentlyContinue"
gh repo view "$user/$repoName" 2>$null | Out-Null
$repoExists = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = "Continue"

if (-not $repoExists) {
  Write-Host "==> Criando repositorio privado $user/$repoName ..." -ForegroundColor Cyan
  # --source=. --push cria remote origin e envia a branch atual
  gh repo create $repoName `
    --private `
    --description "Portal de ingressos Lorde Nelson (Next.js)" `
    --source=. `
    --remote=origin `
    --push

  if ($LASTEXITCODE -ne 0) {
    Write-Host "Falha ao criar/push. Tentando create sem push e push manual..." -ForegroundColor Yellow
    gh repo create $repoName --private --description "Portal de ingressos Lorde Nelson (Next.js)"
    git remote remove origin 2>$null
    git remote add origin "https://github.com/$user/$repoName.git"
    git push -u origin main
  }
} else {
  Write-Host "==> Repo ja existe. Configurando remote e push..." -ForegroundColor Cyan
  git remote remove origin 2>$null
  git remote add origin "https://github.com/$user/$repoName.git"
  git push -u origin main
}

if ($LASTEXITCODE -ne 0) {
  Write-Host "Push falhou. Verifique: git push -u origin main" -ForegroundColor Red
  exit 1
}

Write-Host "==> OK: https://github.com/$user/$repoName" -ForegroundColor Green
