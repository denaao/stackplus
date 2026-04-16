import { prisma } from '../../lib/prisma'
import * as ComandaService from '../comanda/comanda.service'

// Types defined locally until `npx prisma generate` is run with the new schema
type TournamentStatus = 'REGISTRATION' | 'RUNNING' | 'ON_BREAK' | 'FINISHED' | 'CANCELED'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

// ─── Blind templates ──────────────────────────────────────────────────────────

export type BlindLevel = { level: number; smallBlind: number; bigBlind: number; ante: number }

export const BLIND_TEMPLATES: Record<string, BlindLevel[]> = {
  'Turbo 9-max': [
    { level: 1, smallBlind: 25,  bigBlind: 50,   ante: 0 },
    { level: 2, smallBlind: 50,  bigBlind: 100,  ante: 0 },
    { level: 3, smallBlind: 75,  bigBlind: 150,  ante: 0 },
    { level: 4, smallBlind: 100, bigBlind: 200,  ante: 25 },
    { level: 5, smallBlind: 150, bigBlind: 300,  ante: 25 },
    { level: 6, smallBlind: 200, bigBlind: 400,  ante: 50 },
    { level: 7, smallBlind: 300, bigBlind: 600,  ante: 75 },
    { level: 8, smallBlind: 400, bigBlind: 800,  ante: 100 },
    { level: 9, smallBlind: 600, bigBlind: 1200, ante: 150 },
    { level: 10, smallBlind: 800, bigBlind: 1600, ante: 200 },
    { level: 11, smallBlind: 1000, bigBlind: 2000, ante: 250 },
    { level: 12, smallBlind: 1500, bigBlind: 3000, ante: 400 },
    { level: 13, smallBlind: 2000, bigBlind: 4000, ante: 500 },
    { level: 14, smallBlind: 3000, bigBlind: 6000, ante: 750 },
    { level: 15, smallBlind: 4000, bigBlind: 8000, ante: 1000 },
  ],
  'Deep Stack': [
    { level: 1, smallBlind: 25,   bigBlind: 50,   ante: 0 },
    { level: 2, smallBlind: 50,   bigBlind: 100,  ante: 0 },
    { level: 3, smallBlind: 100,  bigBlind: 200,  ante: 0 },
    { level: 4, smallBlind: 150,  bigBlind: 300,  ante: 25 },
    { level: 5, smallBlind: 200,  bigBlind: 400,  ante: 50 },
    { level: 6, smallBlind: 300,  bigBlind: 600,  ante: 75 },
    { level: 7, smallBlind: 400,  bigBlind: 800,  ante: 100 },
    { level: 8, smallBlind: 600,  bigBlind: 1200, ante: 150 },
    { level: 9, smallBlind: 800,  bigBlind: 1600, ante: 200 },
    { level: 10, smallBlind: 1000, bigBlind: 2000, ante: 250 },
    { level: 11, smallBlind: 1500, bigBlind: 3000, ante: 400 },
    { level: 12, smallBlind: 2000, bigBlind: 4000, ante: 500 },
    { level: 13, smallBlind: 3000, bigBlind: 6000, ante: 750 },
    { level: 14, smallBlind: 4000, bigBlind: 8000, ante: 1000 },
    { level: 15, smallBlind: 5000, bigBlind: 10000, ante: 1500 },
    { level: 16, smallBlind: 6000, bigBlind: 12000, ante: 2000 },
    { level: 17, smallBlind: 8000, bigBlind: 16000, ante: 2500 },
    { level: 18, smallBlind: 10000, bigBlind: 20000, ante: 3000 },
  ],
  'Hyper Turbo': [
    { level: 1, smallBlind: 50,  bigBlind: 100,  ante: 0 },
    { level: 2, smallBlind: 100, bigBlind: 200,  ante: 25 },
    { level: 3, smallBlind: 200, bigBlind: 400,  ante: 50 },
    { level: 4, smallBlind: 300, bigBlind: 600,  ante: 75 },
    { level: 5, smallBlind: 500, bigBlind: 1000, ante: 100 },
    { level: 6, smallBlind: 700, bigBlind: 1400, ante: 150 },
    { level: 7, smallBlind: 1000, bigBlind: 2000, ante: 200 },
    { level: 8, smallBlind: 1500, bigBlind: 3000, ante: 300 },
    { level: 9, smallBlind: 2000, bigBlind: 4000, ante: 500 },
    { level: 10, smallBlind: 3000, bigBlind: 6000, ante: 750 },
    { level: 11, smallBlind: 5000, bigBlind: 10000, ante: 1000 },
    { level: 12, smallBlind: 7500, bigBlind: 15000, ante: 2000 },
  ],
}

// ─── Create tournament ────────────────────────────────────────────────────────

export async function createTournament({
  homeGameId,
  name,
  buyInAmount,
  rebuyAmount,
  addonAmount,
  bountyAmount,
  rake,
  startingChips,
  rebuyChips,
  addonChips,
  lateRegistrationLevel,
  rebuyUntilLevel,
  addonAfterLevel,
  minutesPerLevelPreLateReg,
  minutesPerLevelPostLateReg,
  breaks,
  buyInTaxAmount,
  buyInTaxChips,
  rebuyTaxAmount,
  rebuyTaxChips,
  addonTaxAmount,
  addonTaxChips,
  blindTemplateName,
  blindLevels,
}: {
  homeGameId: string
  name: string
  buyInAmount: number
  rebuyAmount?: number | null
  addonAmount?: number | null
  bountyAmount?: number | null
  rake?: number
  startingChips: number
  rebuyChips?: number | null
  addonChips?: number | null
  lateRegistrationLevel?: number | null
  rebuyUntilLevel?: number | null
  addonAfterLevel?: number | null
  minutesPerLevelPreLateReg: number
  minutesPerLevelPostLateReg?: number | null
  breaks?: { afterLevel: number; durationMinutes: number }[]
  buyInTaxAmount?: number | null
  buyInTaxChips?: number | null
  rebuyTaxAmount?: number | null
  rebuyTaxChips?: number | null
  addonTaxAmount?: number | null
  addonTaxChips?: number | null
  blindTemplateName?: string | null
  blindLevels?: BlindLevel[]
}) {
  // Resolve blind levels: custom > template > default
  let levels = blindLevels
  if (!levels || levels.length === 0) {
    if (blindTemplateName && BLIND_TEMPLATES[blindTemplateName]) {
      levels = BLIND_TEMPLATES[blindTemplateName]
    }
  }

  const tournament = await db.tournament.create({
    data: {
      homeGameId,
      name,
      buyInAmount,
      rebuyAmount: rebuyAmount ?? null,
      addonAmount: addonAmount ?? null,
      bountyAmount: bountyAmount ?? null,
      rake: rake ?? 0,
      startingChips,
      rebuyChips: rebuyChips ?? null,
      addonChips: addonChips ?? null,
      lateRegistrationLevel: lateRegistrationLevel ?? null,
      rebuyUntilLevel: rebuyUntilLevel ?? null,
      addonAfterLevel: addonAfterLevel ?? null,
      minutesPerLevelPreLateReg,
      minutesPerLevelPostLateReg: minutesPerLevelPostLateReg ?? null,
      breaks: breaks ? JSON.stringify(breaks) : null,
      buyInTaxAmount: buyInTaxAmount ?? null,
      buyInTaxChips: buyInTaxChips ?? null,
      rebuyTaxAmount: rebuyTaxAmount ?? null,
      rebuyTaxChips: rebuyTaxChips ?? null,
      addonTaxAmount: addonTaxAmount ?? null,
      addonTaxChips: addonTaxChips ?? null,
      blindTemplateName: blindTemplateName ?? null,
      blindLevels: levels
        ? {
            create: levels.map((l) => ({
              level: l.level,
              smallBlind: l.smallBlind,
              bigBlind: l.bigBlind,
              ante: l.ante ?? 0,
            })),
          }
        : undefined,
    },
    include: {
      blindLevels: { orderBy: { level: 'asc' } },
    },
  })

  return tournament
}

// ─── Get tournament ───────────────────────────────────────────────────────────

export async function getTournament(tournamentId: string) {
  return db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: {
      blindLevels: { orderBy: { level: 'asc' } },
      players: {
        orderBy: [{ status: 'asc' }, { position: 'asc' }],
        include: {
          player: { select: { id: true, name: true, cpf: true } },
          comanda: { select: { id: true, balance: true } },
          eliminatedBy: {
            select: { id: true, player: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })
}

export async function listTournaments({
  homeGameId,
  status,
}: {
  homeGameId: string
  status?: TournamentStatus
}) {
  return db.tournament.findMany({
    where: { homeGameId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { players: true } },
    },
  })
}

// ─── Register player ──────────────────────────────────────────────────────────

export async function registerPlayer({
  tournamentId,
  playerId,
  homeGameId,
  registeredByUserId,
}: {
  tournamentId: string
  playerId: string
  homeGameId: string
  registeredByUserId: string
}) {
  const tournament = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  })

  if (!['REGISTRATION', 'RUNNING'].includes(tournament.status)) {
    throw new Error('Inscrições encerradas')
  }

  // Verifica late registration
  if (
    tournament.status === 'RUNNING' &&
    tournament.lateRegistrationLevel !== null &&
    tournament.currentLevel > tournament.lateRegistrationLevel
  ) {
    throw new Error('Período de late registration encerrado')
  }

  // Verifica se já está registrado
  const existing = await db.tournamentPlayer.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId } },
  })
  if (existing) throw new Error('Jogador já registrado neste torneio')

  // Garante/obtém comanda aberta
  let comanda = await db.comanda.findFirst({
    where: { playerId, homeGameId, status: 'OPEN' },
  })
  if (!comanda) {
    comanda = await ComandaService.openComanda({
      playerId,
      homeGameId,
      mode: 'PREPAID',
      openedByUserId: registeredByUserId,
    })
  }

  const tournamentPlayer = await prisma.$transaction(async (tx: any) => {
    const tp = await tx.tournamentPlayer.create({
      data: {
        tournamentId,
        playerId,
        comandaId: comanda!.id,
      },
      include: {
        player: { select: { id: true, name: true } },
      },
    })

    // Lança buy-in na comanda
    const item = await tx.comandaItem.create({
      data: {
        comandaId: comanda!.id,
        type: 'TOURNAMENT_BUYIN',
        amount: Number(tournament.buyInAmount),
        description: `Buy-in: ${tournament.name}`,
        tournamentId,
        tournamentPlayerId: tp.id,
        createdByUserId: registeredByUserId,
      },
    })

    // Atualiza saldo comanda (débito)
    await tx.comanda.update({
      where: { id: comanda!.id },
      data: { balance: { decrement: Number(tournament.buyInAmount) } },
    })

    // Atualiza prize pool
    const rake = Number(tournament.rake) / 100
    const buyInNet = Number(tournament.buyInAmount) * (1 - rake)
    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        prizePool: { increment: buyInNet },
        totalRake: { increment: Number(tournament.buyInAmount) * rake },
      },
    })

    return { ...tp, comandaItem: item }
  })

  return tournamentPlayer
}

// ─── Rebuy ────────────────────────────────────────────────────────────────────

export async function registerRebuy({
  tournamentPlayerId,
  registeredByUserId,
}: {
  tournamentPlayerId: string
  registeredByUserId: string
}) {
  const tp = await db.tournamentPlayer.findUniqueOrThrow({
    where: { id: tournamentPlayerId },
    include: { tournament: true, comanda: true },
  })

  if (!tp.tournament.rebuyAmount) throw new Error('Torneio não tem rebuy')
  if (tp.tournament.rebuyUntilLevel !== null && tp.tournament.currentLevel > tp.tournament.rebuyUntilLevel) {
    throw new Error('Período de rebuy encerrado')
  }
  if (tp.status === 'ELIMINATED' || tp.status === 'WINNER') {
    throw new Error('Jogador eliminado ou vencedor')
  }

  return prisma.$transaction(async (tx: any) => {
    const updated = await tx.tournamentPlayer.update({
      where: { id: tournamentPlayerId },
      data: { rebuysCount: { increment: 1 } },
    })

    await tx.comandaItem.create({
      data: {
        comandaId: tp.comanda.id,
        type: 'TOURNAMENT_REBUY',
        amount: Number(tp.tournament.rebuyAmount),
        description: `Rebuy #${updated.rebuysCount}: ${tp.tournament.name}`,
        tournamentId: tp.tournamentId,
        tournamentPlayerId,
        createdByUserId: registeredByUserId,
      },
    })

    await tx.comanda.update({
      where: { id: tp.comanda.id },
      data: { balance: { decrement: Number(tp.tournament.rebuyAmount) } },
    })

    const rake = Number(tp.tournament.rake) / 100
    const rebuyNet = Number(tp.tournament.rebuyAmount) * (1 - rake)
    await tx.tournament.update({
      where: { id: tp.tournamentId },
      data: {
        prizePool: { increment: rebuyNet },
        totalRake: { increment: Number(tp.tournament.rebuyAmount) * rake },
      },
    })

    return updated
  })
}

// ─── Addon ────────────────────────────────────────────────────────────────────

export async function registerAddon({
  tournamentPlayerId,
  registeredByUserId,
}: {
  tournamentPlayerId: string
  registeredByUserId: string
}) {
  const tp = await db.tournamentPlayer.findUniqueOrThrow({
    where: { id: tournamentPlayerId },
    include: { tournament: true, comanda: true },
  })

  if (!tp.tournament.addonAmount) throw new Error('Torneio não tem add-on')
  if (tp.hasAddon) throw new Error('Jogador já fez add-on')
  if (tp.tournament.addonAfterLevel !== null && tp.tournament.currentLevel < tp.tournament.addonAfterLevel) {
    throw new Error('Add-on ainda não disponível')
  }

  return prisma.$transaction(async (tx: any) => {
    const updated = await tx.tournamentPlayer.update({
      where: { id: tournamentPlayerId },
      data: { hasAddon: true },
    })

    await tx.comandaItem.create({
      data: {
        comandaId: tp.comanda.id,
        type: 'TOURNAMENT_ADDON',
        amount: Number(tp.tournament.addonAmount),
        description: `Add-on: ${tp.tournament.name}`,
        tournamentId: tp.tournamentId,
        tournamentPlayerId,
        createdByUserId: registeredByUserId,
      },
    })

    await tx.comanda.update({
      where: { id: tp.comanda.id },
      data: { balance: { decrement: Number(tp.tournament.addonAmount) } },
    })

    const rake = Number(tp.tournament.rake) / 100
    const addonNet = Number(tp.tournament.addonAmount) * (1 - rake)
    await tx.tournament.update({
      where: { id: tp.tournamentId },
      data: {
        prizePool: { increment: addonNet },
        totalRake: { increment: Number(tp.tournament.addonAmount) * rake },
      },
    })

    return updated
  })
}

// ─── Eliminate player ─────────────────────────────────────────────────────────

export async function eliminatePlayer({
  tournamentPlayerId,
  eliminatedByPlayerId,
  position,
  registeredByUserId,
}: {
  tournamentPlayerId: string
  eliminatedByPlayerId?: string | null
  position?: number
  registeredByUserId: string
}) {
  const tp = await db.tournamentPlayer.findUniqueOrThrow({
    where: { id: tournamentPlayerId },
    include: { tournament: true, comanda: true },
  })

  if (tp.status === 'ELIMINATED') throw new Error('Jogador já eliminado')

  return prisma.$transaction(async (tx: any) => {
    // Marca eliminado
    const eliminated = await tx.tournamentPlayer.update({
      where: { id: tournamentPlayerId },
      data: {
        status: 'ELIMINATED',
        eliminatedAt: new Date(),
        eliminatedAtLevel: tp.tournament.currentLevel,
        eliminatedByPlayerId: eliminatedByPlayerId ?? null,
        position: position ?? null,
      },
    })

    // Bounty: creditado na comanda do eliminador
    if (tp.tournament.bountyAmount && eliminatedByPlayerId) {
      const eliminator = await tx.tournamentPlayer.findUnique({
        where: { id: eliminatedByPlayerId },
        include: { comanda: true },
      })
      if (eliminator) {
        await tx.tournamentPlayer.update({
          where: { id: eliminatedByPlayerId },
          data: { bountyCollected: { increment: Number(tp.tournament.bountyAmount) } },
        })
        await tx.comandaItem.create({
          data: {
            comandaId: eliminator.comanda.id,
            type: 'TOURNAMENT_BOUNTY_RECEIVED',
            amount: Number(tp.tournament.bountyAmount),
            description: `Bounty: ${tp.tournament.name}`,
            tournamentId: tp.tournamentId,
            tournamentPlayerId: eliminatedByPlayerId,
            createdByUserId: registeredByUserId,
          },
        })
        await tx.comanda.update({
          where: { id: eliminator.comanda.id },
          data: { balance: { increment: Number(tp.tournament.bountyAmount) } },
        })
      }
    }

    // Verifica se restou apenas 1 ativo → finaliza torneio
    const activePlayers = await tx.tournamentPlayer.count({
      where: {
        tournamentId: tp.tournamentId,
        status: { in: ['REGISTERED', 'ACTIVE'] },
      },
    })
    if (activePlayers <= 1) {
      const winner = await tx.tournamentPlayer.findFirst({
        where: { tournamentId: tp.tournamentId, status: { in: ['REGISTERED', 'ACTIVE'] } },
      })
      if (winner) {
        await tx.tournamentPlayer.update({
          where: { id: winner.id },
          data: { status: 'WINNER', position: 1 },
        })
      }
      await tx.tournament.update({
        where: { id: tp.tournamentId },
        data: { status: 'FINISHED', finishedAt: new Date() },
      })
    }

    return eliminated
  })
}

// ─── Award prize ──────────────────────────────────────────────────────────────

export async function awardPrize({
  tournamentPlayerId,
  prizeAmount,
  registeredByUserId,
}: {
  tournamentPlayerId: string
  prizeAmount: number
  registeredByUserId: string
}) {
  const tp = await db.tournamentPlayer.findUniqueOrThrow({
    where: { id: tournamentPlayerId },
    include: { tournament: true, comanda: true },
  })

  return prisma.$transaction(async (tx: any) => {
    await tx.tournamentPlayer.update({
      where: { id: tournamentPlayerId },
      data: { prizeAmount },
    })

    await tx.comandaItem.create({
      data: {
        comandaId: tp.comanda.id,
        type: 'TOURNAMENT_PRIZE',
        amount: prizeAmount,
        description: `Prêmio: ${tp.tournament.name}`,
        tournamentId: tp.tournamentId,
        tournamentPlayerId,
        createdByUserId: registeredByUserId,
      },
    })

    // Crédito na comanda
    await tx.comanda.update({
      where: { id: tp.comanda.id },
      data: { balance: { increment: prizeAmount } },
    })
  })
}

// ─── Timer / level controls ───────────────────────────────────────────────────

export async function startTournament(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (t.status !== 'REGISTRATION') throw new Error('Torneio não está em inscrições')

  return db.tournament.update({
    where: { id: tournamentId },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      currentLevel: 1,
      levelStartedAt: new Date(),
    },
  })
}

export async function advanceLevel(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: { blindLevels: { orderBy: { level: 'asc' } } },
  })
  if (t.status !== 'RUNNING') throw new Error('Torneio não está rodando')

  const nextLevel = t.currentLevel + 1
  const maxLevel = t.blindLevels[t.blindLevels.length - 1]?.level ?? nextLevel

  return db.tournament.update({
    where: { id: tournamentId },
    data: {
      currentLevel: Math.min(nextLevel, maxLevel),
      levelStartedAt: new Date(),
      isOnBreak: false,
      breakStartedAt: null,
    },
  })
}

export async function startBreak(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (t.status !== 'RUNNING') throw new Error('Torneio não está rodando')

  return db.tournament.update({
    where: { id: tournamentId },
    data: {
      status: 'ON_BREAK',
      isOnBreak: true,
      breakStartedAt: new Date(),
    },
  })
}

export async function endBreak(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (t.status !== 'ON_BREAK') throw new Error('Torneio não está em intervalo')

  return db.tournament.update({
    where: { id: tournamentId },
    data: {
      status: 'RUNNING',
      isOnBreak: false,
      breakStartedAt: null,
      currentLevel: { increment: 1 },
      levelStartedAt: new Date(),
    },
  })
}

export async function updateBlindLevels(
  tournamentId: string,
  levels: { level: number; smallBlind: number; bigBlind: number; ante: number }[],
  breaks?: { afterLevel: number; durationMinutes: number }[]
) {
  await db.tournamentBlindLevel.deleteMany({ where: { tournamentId } })
  await db.tournamentBlindLevel.createMany({
    data: levels.map((l) => ({ tournamentId, level: l.level, smallBlind: l.smallBlind, bigBlind: l.bigBlind, ante: l.ante ?? 0 })),
  })
  if (breaks !== undefined) {
    await (db as any).tournament.update({
      where: { id: tournamentId },
      data: { breaks: JSON.stringify(breaks) },
    })
  }
}

export async function cancelTournament(tournamentId: string) {
  return db.tournament.update({
    where: { id: tournamentId },
    data: { status: 'CANCELED', finishedAt: new Date() },
  })
}

// ─── Payout structure ─────────────────────────────────────────────────────────

export function calcPayoutSuggestion(prizePool: number, playerCount: number): Array<{ position: number; amount: number; percent: number }> {
  // Estrutura simples: top 15-20% recebem, decrescente
  if (playerCount < 3) return [{ position: 1, amount: prizePool, percent: 100 }]

  const paid = Math.max(1, Math.ceil(playerCount * 0.15))

  // Distribuição decrescente aproximada
  const weights: number[] = []
  for (let i = 1; i <= paid; i++) {
    weights.push(1 / i)
  }
  const total = weights.reduce((s, w) => s + w, 0)
  const percents = weights.map((w) => Math.round((w / total) * 100 * 10) / 10)

  // Ajusta pra somar 100%
  const diff = 100 - percents.reduce((s, p) => s + p, 0)
  percents[0] = Math.round((percents[0] + diff) * 10) / 10

  return percents.map((pct, i) => ({
    position: i + 1,
    amount: Math.round((prizePool * pct) / 100),
    percent: pct,
  }))
}
