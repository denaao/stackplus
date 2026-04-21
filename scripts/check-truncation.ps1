# check-truncation.ps1
#
# Detecta arquivos possivelmente truncados pelo bug do mount do Cowork.
#
# Uso:
#   ./scripts/check-truncation.ps1                    # verifica stackplus-api + stackplus-web
#   ./scripts/check-truncation.ps1 -Path stackplus-web  # apenas frontend
#   ./scripts/check-truncation.ps1 -Fix               # restaura arquivos truncados do git HEAD
#
# Heuristicas (do mais confiavel pro menos):
#   1. Arquivo vazio
#   2. Tamanho < 70% do tracked no git HEAD (arquivo tracked)
#   3. Ultima linha termina com operador incompleto (=, +, -, &&, ||, etc)
#   4. Contagem de { e } muito desbalanceada
#
# Nao detecta 100%, mas pega os casos mais grosseiros. Falsos positivos
# preferem ser "suspicious" em vez de "truncated" — so o -Fix restaura os
# marcados como "truncated".

param(
    [string]$Path = ".",
    [switch]$Fix
)

$ErrorActionPreference = "Stop"

function Test-FileIntegrity {
    param([string]$FilePath)

    if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
        return @{ Status = "ok"; Reason = "" }  # nao e file — ignora
    }

    $content = [System.IO.File]::ReadAllText($FilePath, [System.Text.UTF8Encoding]::new($false))
    $size = $content.Length

    # 1. Arquivo vazio
    if ($size -eq 0) {
        return @{ Status = "truncated"; Reason = "empty file" }
    }

    # 2. Comparacao com git HEAD — criterio mais confiavel
    try {
        $relPath = Resolve-Path -LiteralPath $FilePath -Relative
        $gitContent = git show "HEAD:$relPath" 2>$null
        if ($gitContent) {
            $gitSize = ($gitContent | Out-String).Length
            # Se arquivo tracked perdeu >30% do tamanho, provavelmente truncou
            if ($gitSize -gt 2000 -and $size -lt ($gitSize * 0.7)) {
                return @{
                    Status = "truncated"
                    Reason = "size $size bytes < 70% of HEAD ($gitSize bytes)"
                }
            }
        }
    } catch {
        # nao e repo git ou arquivo novo — segue pras outras heuristicas
    }

    # 3. Ultima linha termina com operador incompleto
    $lines = $content -split "`n"
    $lastLine = ""
    for ($i = $lines.Count - 1; $i -ge 0; $i--) {
        $l = $lines[$i].TrimEnd()
        if ($l.Length -gt 0) { $lastLine = $l; break }
    }

    $incompleteOperators = @('=', '+', '-', '*', '/', '&', '|', ',', '.', '<', ':', '?')
    if ($lastLine.Length -gt 0) {
        $lastChar = $lastLine[-1]
        if ($incompleteOperators -contains [string]$lastChar) {
            # Ignora comentarios de uma linha que terminam com operador por coincidencia
            if ($lastLine -notmatch '^\s*//' -and $lastLine -notmatch '\*/\s*$') {
                return @{
                    Status = "suspicious"
                    Reason = "last line ends with incomplete operator '$lastChar'"
                }
            }
        }
    }

    # 4. Braces desbalanceadas (ignora strings/comentarios = heuristica bruta)
    # So flaga se diferenca for grande — arquivos tipicos sao razoavelmente balanceados
    # mesmo ignorando strings.
    $openBraces = ($content.ToCharArray() | Where-Object { $_ -eq '{' }).Count
    $closeBraces = ($content.ToCharArray() | Where-Object { $_ -eq '}' }).Count
    $diff = [Math]::Abs($openBraces - $closeBraces)
    if ($diff -gt 5) {
        return @{
            Status = "suspicious"
            Reason = "unbalanced braces: $openBraces open vs $closeBraces close (diff $diff)"
        }
    }

    return @{ Status = "ok"; Reason = "" }
}

# ─── Main ────────────────────────────────────────────────────────────────────

$targets = @()
if ($Path -eq ".") {
    $targets += Get-ChildItem -LiteralPath "stackplus-api/src" -Recurse -File -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/app" -Recurse -File -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/components" -Recurse -File -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/lib" -Recurse -File -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/hooks" -Recurse -File -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/services" -Recurse -File -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
    $targets += Get-ChildItem -LiteralPath "stackplus-web/store" -Recurse -File -Include "*.ts","*.tsx" -ErrorAction SilentlyContinue
} else {
    $targets = Get-ChildItem -LiteralPath $Path -Recurse -File -Include "*.ts","*.tsx"
}

$truncated = @()
$suspicious = @()
$checked = 0

foreach ($file in $targets) {
    if ($file.FullName -match "node_modules|\.next|dist|\.git") { continue }
    $checked++
    $result = Test-FileIntegrity -FilePath $file.FullName
    if ($result.Status -eq "truncated") {
        $truncated += [PSCustomObject]@{
            Path   = (Resolve-Path -LiteralPath $file.FullName -Relative)
            Reason = $result.Reason
        }
    } elseif ($result.Status -eq "suspicious") {
        $suspicious += [PSCustomObject]@{
            Path   = (Resolve-Path -LiteralPath $file.FullName -Relative)
            Reason = $result.Reason
        }
    }
}

Write-Host ""
Write-Host "Verificados: $checked arquivos"
Write-Host "Truncados (alta confianca): $($truncated.Count)"
Write-Host "Suspeitos (pode ser falso positivo): $($suspicious.Count)"
Write-Host ""

if ($truncated.Count -eq 0 -and $suspicious.Count -eq 0) {
    Write-Host "[OK] Nenhum arquivo suspeito." -ForegroundColor Green
    exit 0
}

if ($truncated.Count -gt 0) {
    Write-Host "=== TRUNCADOS ===" -ForegroundColor Red
    $truncated | Format-Table -AutoSize
}

if ($suspicious.Count -gt 0) {
    Write-Host "=== SUSPEITOS ===" -ForegroundColor Yellow
    $suspicious | Format-Table -AutoSize
}

if ($Fix -and $truncated.Count -gt 0) {
    Write-Host ""
    Write-Host "Restaurando arquivos TRUNCADOS do git HEAD..." -ForegroundColor Yellow
    foreach ($issue in $truncated) {
        Write-Host "  git checkout HEAD -- $($issue.Path)"
        git checkout HEAD -- $issue.Path 2>&1 | Out-Null
    }
    Write-Host "[OK] Restaurados. Suspeitos nao foram tocados." -ForegroundColor Green
} elseif ($truncated.Count -gt 0) {
    Write-Host ""
    Write-Host "Para restaurar arquivos truncados do git HEAD, rode:" -ForegroundColor Yellow
    Write-Host "  ./scripts/check-truncation.ps1 -Fix"
}

if ($truncated.Count -gt 0) { exit 1 }
exit 0
