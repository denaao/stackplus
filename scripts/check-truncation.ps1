# check-truncation.ps1
#
# Detecta arquivos possivelmente truncados pelo bug do mount do Cowork.
#
# Uso:
#   ./scripts/check-truncation.ps1                    # verifica stackplus-api + stackplus-web
#   ./scripts/check-truncation.ps1 -Path stackplus-web  # apenas frontend
#   ./scripts/check-truncation.ps1 -Fix               # restaura arquivos truncados do git HEAD
#
# Heurísticas de truncamento:
#   1. Arquivo .ts/.tsx NAO termina com `}`, `)`, `>`, `;` ou caractere valido
#   2. Ultima linha tem string aberta, JSX tag sem fechar, ou termina no meio
#   3. Arquivo com >500 linhas e tamanho < 80% do que esta no git HEAD
#
# Nao detecta 100%, mas pega os casos mais grosseiros rapidamente.

param(
    [string]$Path = ".",
    [switch]$Fix
)

$ErrorActionPreference = "Stop"

function Test-FileIntegrity {
    param([string]$FilePath)

    if (-not (Test-Path -LiteralPath $FilePath)) {
        return @{ Status = "missing"; Reason = "file not found" }
    }

    $content = [System.IO.File]::ReadAllText($FilePath, [System.Text.UTF8Encoding]::new($false))
    $lines = $content -split "`n"
    $lineCount = $lines.Count
    $size = (Get-Item -LiteralPath $FilePath).Length

    # 1. Arquivo vazio
    if ($size -eq 0) {
        return @{ Status = "truncated"; Reason = "empty file" }
    }

    # 2. Termina no meio de string/identificador
    $lastLine = ($lines[-2..-1] -join "`n").TrimEnd()  # ultimas 2 linhas + trim
    $validEnders = @('}', ')', '>', ';', ']', '`', '"', "'")
    $lastChar = if ($lastLine) { $lastLine[-1] } else { '' }

    if ($validEnders -notcontains $lastChar -and $lastLine.Length -gt 0) {
        return @{ Status = "suspicious"; Reason = "ends with '$lastChar' (not closing char)" }
    }

    # 3. String literal sem fechar no final
    if ($lastLine -match '"[^"]*$' -or $lastLine -match "'[^']*$") {
        return @{ Status = "truncated"; Reason = "unterminated string literal" }
    }

    # 4. JSX tag sem fechar
    if ($lastLine -match '<[a-zA-Z][^>]*$') {
        return @{ Status = "truncated"; Reason = "unterminated JSX tag" }
    }

    # 5. Comparacao com git HEAD (se estiver em repo git)
    try {
        $relPath = Resolve-Path -LiteralPath $FilePath -Relative
        $gitSize = (git show "HEAD:$relPath" 2>$null | Measure-Object -Character).Characters
        if ($gitSize -and $size -lt ($gitSize * 0.8) -and $lineCount -gt 500) {
            return @{ Status = "truncated"; Reason = "size $size < 80% of HEAD size $gitSize ($lineCount lines)" }
        }
    } catch {
        # Nao e git repo ou arquivo novo — ignora
    }

    return @{ Status = "ok"; Reason = "" }
}

# ─── Main ────────────────────────────────────────────────────────────────────

$targets = @()
if ($Path -eq ".") {
    $targets += Get-ChildItem -LiteralPath "stackplus-api/src" -Recurse -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/app" -Recurse -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/components" -Recurse -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/lib" -Recurse -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/hooks" -Recurse -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/services" -Recurse -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/store" -Recurse -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
} else {
    $targets = Get-ChildItem -LiteralPath $Path -Recurse -Include "*.ts","*.tsx"
}

$issues = @()
$checked = 0

foreach ($file in $targets) {
    if ($file.FullName -match "node_modules|\.next|dist|\.git") { continue }
    $checked++
    $result = Test-FileIntegrity -FilePath $file.FullName
    if ($result.Status -ne "ok") {
        $rel = Resolve-Path -LiteralPath $file.FullName -Relative
        $issues += [PSCustomObject]@{
            Path   = $rel
            Status = $result.Status
            Reason = $result.Reason
        }
    }
}

Write-Host ""
Write-Host "Verificados: $checked arquivos"
Write-Host "Com problemas: $($issues.Count)"
Write-Host ""

if ($issues.Count -eq 0) {
    Write-Host "[OK] Nenhum arquivo suspeito." -ForegroundColor Green
    exit 0
}

$issues | Format-Table -AutoSize

if ($Fix) {
    Write-Host ""
    Write-Host "Restaurando arquivos suspeitos do git HEAD..." -ForegroundColor Yellow
    foreach ($issue in $issues) {
        if ($issue.Status -eq "truncated") {
            Write-Host "  git checkout HEAD -- $($issue.Path)"
            git checkout HEAD -- $issue.Path 2>&1 | Out-Null
        }
    }
    Write-Host "[OK] Restaurados." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Para restaurar automaticamente do git HEAD, rode:" -ForegroundColor Yellow
    Write-Host "  ./scripts/check-truncation.ps1 -Fix"
}

exit 1
