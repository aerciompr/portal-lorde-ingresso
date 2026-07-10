# Cria o repositório privado portal-lorde-ingresso e faz push da branch main.
# Pré-requisito: gh auth login (token válido)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "==> Verificando autenticacao GitHub..." -ForegroundColor Cyan
gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Faca login: gh auth login -h github.com -p https -w" -ForegroundColor Yellow
  exit 1
}

$repoName = "portal-lorde-ingresso"
$user = (gh api user --jq .login)
Write-Host "==> Usuario: $user" -ForegroundColor Cyan

# Cria se nao existir
$exists = gh repo view "$user/$repoName" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "==> Criando repositorio privado $user/$repoName ..." -ForegroundColor Cyan
  gh repo create $repoName --private --description "Portal de ingressos Lorde Nelson (Next.js)" --source=. --remote=origin --push
} else {
  Write-Host "==> Repo ja existe. Configurando remote e push..." -ForegroundColor Cyan
  git remote remove origin 2>$null
  git remote add origin "https://github.com/$user/$repoName.git"
  git push -u origin main
}

Write-Host "==> OK: https://github.com/$user/$repoName" -ForegroundColor Green
