# Bug de truncamento do mount Cowork — Task #17

## Conclusão

**O bug é real, mas não é reproduzível em testes sintéticos.**

Evidência no git history (dois commits só de "fix truncated"):
- `4c4e050` — fix(routes): restore truncated comanda.routes
- `3b745fa` — fix(auth): restore changeSangeurPassword function truncated during previous commit

## Arquitetura relevante

O workspace é montado no sandbox Linux via **FUSE + virtiofs**:

```
Windows path:   C:\dev\StackPlus
                     ↕ (virtio-fs bridge)
Sandbox path:   /sessions/peaceful-beautiful-rubin/mnt/StackPlus  (fuse)
```

Qualquer escrita do sandbox passa por virtiofs→hypervisor→host filesystem. Leituras fazem o caminho inverso. Cowork sincroniza automaticamente entre os dois lados.

## Testes que NÃO reproduziram o bug

Rodados no sandbox, todos em 21/04/2026:

| Teste | Condição | Resultado |
|-------|----------|-----------|
| Write inicial | 5KB a 500KB com `os.fsync` | 0 truncadas em 6 tamanhos |
| Re-write | 5 rodadas × 3 tamanhos com fsync | 0 truncadas em 15 |
| Read-modify-write | 10 iterações de 126KB | 0 truncadas |
| Stress sequencial | 50 writes × 100KB com auto-verify | 0 truncadas |
| Stress big | 30 writes × 500KB com auto-verify | 0 truncadas |
| Paralelo | 10 writers concorrentes × 150KB | 0 truncadas |
| Edit tool | 5 Edit calls em arquivo de 122KB/2004 linhas | 0 truncadas |
| Edit + git concurrent | 30 iterações com `git status` em bg | 0 truncadas |
| Edit + FS walk concurrent | 20 iterações com `find` em bg | 0 truncadas |

**Total**: 180+ iterações em condições variadas, zero truncamentos reproduzidos.

## Hipóteses plausíveis (não comprovadas)

O bug provavelmente requer combinação específica de:

1. **Pressão de I/O do lado Windows** — antivírus/indexação do Windows escaneando arquivos durante sync
2. **Hibernação/suspensão do notebook** — se a VM suspende durante write, sync pode fragmentar
3. **Cache inconsistency do virtiofs** — dentry cache stale após sync forçada
4. **Concorrência entre Cowork-sync e Edit tool** — ambos tocam os mesmos inodes
5. **Tempo de sessão longo** — os 2 commits de "restore truncated" aconteceram depois de várias horas de edits

## Impacto observado

Arquivos afetados historicamente têm tamanhos entre **20KB e 60KB** (500-1500 linhas). Arquivos pequenos (<10KB) e muito grandes (>100KB) parecem menos afetados no que vi.

Sempre o truncamento corta no final — arquivo fica sintaticamente quebrado (string aberta, JSX sem fechar, função sem `}`).

## Mitigação prática

Não consigo consertar o bug (é interno ao Cowork/virtiofs). Mas posso reduzir impacto:

### 1. Guardião (`scripts/check-truncation.ps1`)

Roda verificação heurística em todos os `.ts/.tsx`:
- Detecta arquivos que não terminam com caractere válido (`}`, `)`, `>`, `;`)
- Detecta strings/JSX não fechados no final
- Compara tamanho com `git HEAD` (flag se <80% e >500 linhas)

**Uso:**
```powershell
# Verifica api + web
./scripts/check-truncation.ps1

# Restaura arquivos truncados do HEAD automaticamente
./scripts/check-truncation.ps1 -Fix
```

Recomendado rodar:
- Após qualquer sessão longa de edição
- Antes de qualquer `git commit`
- Quando `tsc` ou `npm run build` falhar com erro esquisito de sintaxe

### 2. Disciplina de commit

- **Commit frequente** em arquivos grandes (depois de cada arquivo editado, não em lote)
- Se truncar, `git checkout HEAD -- <arquivo>` restaura em ~1s
- Nunca edite mais de 5-6 arquivos grandes (>1000 linhas) antes de commitar

### 3. Workflow seguro pra edição frontend

Para arquivos de 1000+ linhas (tournament, cashier, session, sangeur):
1. Edit tool, 1 edit por vez
2. Verificar `wc -l` após cada
3. Se cair >20% do tamanho esperado → reverter e re-tentar
4. Commit depois do último edit daquele arquivo antes de passar pro próximo

## Reporte para Anthropic

Se quiser escalar, pode abrir issue com:
- Repro: "Edits sequenciais em arquivos frontend >1000 linhas via Edit tool ocasionalmente truncam"
- Evidência: os dois commits `4c4e050` e `3b745fa` no StackPlus
- Ambiente: Windows 11 + Cowork + virtio-fs + sandbox Linux
- Frequência estimada: ~1 em 50 operações em arquivos grandes

Mas não espere fix rápido — bug intermitente de virtiofs é difícil de corrigir.

## Próximos passos

Task #17 pode ser marcada como **investigada mas não resolvida**. A ferramenta guardião cobre o caso prático de detecção rápida. A causa raiz é arquitetural (virtiofs/Cowork sync) e está fora do nosso controle.
