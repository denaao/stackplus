/**
 * MIGRAÇÃO: Encadeamento de saldos entre comandas do mesmo jogador/home game
 *
 * Lógica:
 * Para cada jogador+homeGame com múltiplas comandas:
 *   1. Ordena por openedAt (mais antiga primeiro)
 *   2. Para cada par consecutivo (A → B):
 *      - Se A tem saldo ≠ 0, cria item de carry-over em B
 *      - Atualiza o balance de B
 *   3. Processa em cadeia: A→B, depois B(atualizado)→C, etc.
 *
 * Uso:
 *   DRY_RUN=true npx ts-node src/scripts/merge-comandas.ts   (só mostra, não altera)
 *   npx ts-node src/scripts/merge-comandas.ts                (executa)
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const DRY_RUN = process.env.DRY_RUN === 'true'

async function main() {
  console.log(`\n=== MERGE COMANDAS ${DRY_RUN ? '[DRY RUN]' : '[EXECUTANDO]'} ===\n`)

  // Busca todas as comandas agrupadas por jogador/homeGame com mais de 1
  const allComandas = await db.comanda.findMany({
    orderBy: { openedAt: 'asc' },
    select: {
      id: true,
      playerId: true,
      homeGameId: true,
      balance: true,
      status: true,
      openedAt: true,
      player: { select: { name: true } },
      items: {
        where: { description: 'Saldo transportado da comanda anterior' },
        select: { id: true },
      },
    },
  })

  // Agrupa por playerId+homeGameId
  const groups = new Map<string, typeof allComandas>()
  for (const c of allComandas) {
    const key = `${c.playerId}::${c.homeGameId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  let totalGrupos = 0
  let totalCarryOvers = 0

  for (const [key, comandas] of groups.entries()) {
    if (comandas.length < 2) continue

    const playerName = comandas[0].player.name
    const [, homeGameId] = key.split('::')
    console.log(`\n→ ${playerName} | homeGame: ${homeGameId.slice(0, 8)}... | ${comandas.length} comandas`)

    totalGrupos++

    // Mantém saldo acumulado para encadeamento correto
    let runningBalance = Number(comandas[0].balance)

    for (let i = 0; i < comandas.length - 1; i++) {
      const older = comandas[i]
      const newer = comandas[i + 1]

      // Usa o saldo corrido (já pode ter sido ajustado na iteração anterior)
      const carryBalance = runningBalance

      console.log(
        `   [${i + 1}/${comandas.length - 1}] ${older.id.slice(0, 8)} (saldo: ${carryBalance}) → ${newer.id.slice(0, 8)}`
      )

      if (carryBalance === 0) {
        console.log(`      ↳ Saldo zero, sem carry-over`)
        runningBalance = Number(newer.balance)
        continue
      }

      // Verifica se já existe carry-over nesta comanda (evita duplicata)
      if (newer.items.length > 0) {
        console.log(`      ↳ Já possui carry-over, pulando`)
        runningBalance = Number(newer.balance)
        continue
      }

      const isCredit = carryBalance > 0
      const absAmount = Math.abs(carryBalance)
      const type = isCredit ? 'CARRY_IN' : 'CARRY_OUT'
      const delta = isCredit ? absAmount : -absAmount

      console.log(
        `      ↳ Criando ${type} de R$ ${absAmount.toFixed(2)} em ${newer.id.slice(0, 8)}`
      )

      if (!DRY_RUN) {
        await db.$transaction(async (tx: any) => {
          // Cria o item de carry-over
          await tx.comandaItem.create({
            data: {
              comandaId: newer.id,
              type,
              amount: absAmount,
              description: 'Saldo transportado da comanda anterior',
              createdByUserId: newer.id, // placeholder — não temos userId aqui
            },
          })
          // Atualiza o balance da comanda mais nova
          await tx.comanda.update({
            where: { id: newer.id },
            data: { balance: { increment: delta } },
          })
        })
      }

      // Atualiza saldo corrido para o próximo par
      runningBalance = Number(newer.balance) + delta
      totalCarryOvers++
    }
  }

  console.log(`\n=== RESUMO ===`)
  console.log(`Grupos processados: ${totalGrupos}`)
  console.log(`Carry-overs ${DRY_RUN ? 'que seriam criados' : 'criados'}: ${totalCarryOvers}`)
  if (DRY_RUN) console.log(`\n⚠️  DRY RUN — nenhuma alteração foi feita. Remove DRY_RUN=true para executar.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
