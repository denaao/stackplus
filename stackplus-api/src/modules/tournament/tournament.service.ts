import { prisma } from '../../lib/prisma'
import { Prisma, TournamentStatus } from '@prisma/client'
import * as ComandaService from '../comanda/comanda.service'
import { isEventStaff } from '../../lib/event-auth'

// Alias mantido pra reduzir churn do diff. Pode ser removido gradualmente.
const db = prisma

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
  doubleBuyInBonusChips,
  doubleRebuyEnabled,
  doubleRebuyBonusChips,
  staffRetentionPct,
  staffRetentionDest,
  rankingRetentionPct,
  timeChipBonus,
  timeChipUntilLevel,
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
  doubleBuyInBonusChips?: number | null
  doubleRebuyEnabled?: boolean
  doubleRebuyBonusChips?: number | null
  staffRetentionPct?: number | null
  staffRetentionDest?: string | null
  rankingRetentionPct?: number | null
  timeChipBonus?: number | null
  timeChipUntilLevel?: number | null
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
      doubleBuyInBonusChips: doubleBuyInBonusChips ?? null,
      doubleRebuyEnabled: doubleRebuyEnabled ?? false,
      doubleRebuyBonusChips: doubleRebuyBonusChips ?? null,
      staffRetentionPct: staffRetentionPct ?? null,
      staffRetentionDest: staffRetentionDest ?? null,
      rankingRetentionPct: rankingRetentionPct ?? null,
      timeChipBonus: timeChipBonus ?? null,
      timeChipUntilLevel: timeChipUntilLevel ?? null,
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

// ─── Update tournament (REGISTRATION only) ───────────────────────────────────

export async function updateTournament(
  tournamentId: string,
  data: {
    name?: string
    buyInAmount?: number
    rebuyAmount?: number | null
    addonAmount?: number | null
    bountyAmount?: number | null
    rake?: number
    startingChips?: number
    rebuyChips?: number | null
    addonChips?: number | null
    lateRegistrationLevel?: number | null
    rebuyUntilLevel?: number | null
    addonAfterLevel?: number | null
    minutesPerLevelPreLateReg?: number
    minutesPerLevelPostLateReg?: number | null
    breaks?: { afterLevel: number; durationMinutes: number }[]
    buyInTaxAmount?: number | null
    buyInTaxChips?: number | null
    rebuyTaxAmount?: number | null
    rebuyTaxChips?: number | null
    addonTaxAmount?: number | null
    addonTaxChips?: number | null
    blindLevels?: BlindLevel[]
    doubleBuyInBonusChips?: number | null
    doubleRebuyEnabled?: boolean
    doubleRebuyBonusChips?: number | null
    staffRetentionPct?: number | null
    staffRetentionDest?: string | null
    rankingRetentionPct?: number | null
    timeChipBonus?: number | null
    timeChipUntilLevel?: number | null
  },
) {
  const existing = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { status: true } })
  if (existing.status !== 'REGISTRATION') {
    throw new Error('Torneio só pode ser editado durante fase de inscrições')
  }

  const { blindLevels, breaks, ...rest } = data

  await db.tournament.update({
    where: { id: tournamentId },
    data: {
      ...rest,
      ...(breaks !== undefined ? { breaks: JSON.stringify(breaks) } : {}),
      ...(blindLevels !== undefined
        ? {
            blindLevels: {
              deleteMany: {},
              create: blindLevels.map((l) => ({
                level: l.level,
                smallBlind: l.smallBlind,
                bigBlind: l.bigBlind,
                ante: l.ante ?? 0,
              })),
            },
          }
        : {}),
    },
  })

  return getTournament(tournamentId)
}

// ─── Update rebuy/addon limits during RUNNING tournament ─────────────────────

export async function updateLimits(
  tournamentId: string,
  data: {
    rebuyUntilLevel?: number | null
    addonAfterLevel?: number | null
  },
) {
  const existing = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { status: true } })
  if (!['REGISTRATION', 'RUNNING', 'ON_BREAK'].includes(existing.status)) {
    throw new Error('Torneio não está ativo')
  }
  await db.tournament.update({ where: { id: tournamentId }, data })
  return getTournament(tournamentId)
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
  eventId,
  registeredByUserId,
  buyInType = 'NORMAL',
  paymentMethod,
}: {
  tournamentId: string
  playerId: string
  homeGameId?: string
  eventId?: string
  registeredByUserId: string
  buyInType?: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'
  paymentMethod?: 'CASH' | 'CARD' | 'PIX' | 'VOUCHER'
}) {
  if (!homeGameId && !eventId) throw new Error('homeGameId ou eventId e obrigatorio')
  const tournament = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
  })

  if (!['REGISTRATION', 'RUNNING'].includes(tournament.status)) {
    throw new Error('Inscrições encerradas')
  }

  if (
    tournament.status === 'RUNNING' &&
    tournament.lateRegistrationLevel !== null &&
    tournament.currentLevel > tournament.lateRegistrationLevel
  ) {
    throw new Error('Período de late registration encerrado')
  }

  const existing = await db.tournamentPlayer.findUnique({
    where: { tournamentId_playerId: { tournamentId, playerId } },
  })
  if (existing) throw new Error('Jogador já registrado neste torneio')

  let comanda = await db.comanda.findFirst({
    where: homeGameId
      ? { playerId, homeGameId, status: 'OPEN' }
      : { playerId, eventId, status: 'OPEN' },
  })
  if (!comanda) {
    comanda = await ComandaService.openComanda({
      playerId,
      ...(homeGameId ? { homeGameId } : { eventId }),
      mode: 'PREPAID',
      openedByUserId: registeredByUserId,
    })
  }

  const base = Number(tournament.buyInAmount)
  const taxAmount = Number(tournament.buyInTaxAmount ?? 0)
  const taxChips = Number(tournament.buyInTaxChips ?? 0)
  const bonusChips = Number(tournament.doubleBuyInBonusChips ?? 0)
  const rakeRate = Number(tournament.rake) / 100

  // Time chip: elegível se o torneio ainda não começou ou o nível atual está dentro do período configurado
  const timeChipAwarded = !!tournament.timeChipBonus && (
    tournament.status === 'REGISTRATION' ||
    tournament.currentLevel <= (tournament.timeChipUntilLevel ?? Infinity)
  )
  const timeChipBonus = timeChipAwarded ? Number(tournament.timeChipBonus) : 0

  // Calcula valor base (sobre o qual incide o rake), taxa da casa e fichas
  let baseForRake: number  // valor que entra no prize/rake
  let taxForHouse: number  // taxa que vai integral para a casa
  let chips: number
  let description: string

  if (buyInType === 'DOUBLE') {
    // 2× base + 2× taxa
    baseForRake = base * 2
    taxForHouse = taxAmount * 2
    chips = (tournament.startingChips + taxChips) * 2 + bonusChips + timeChipBonus
    description = `Buy-in Duplo: ${tournament.name}`
  } else if (buyInType === 'NORMAL_WITH_TAX' && taxAmount > 0) {
    baseForRake = base
    taxForHouse = taxAmount
    chips = tournament.startingChips + taxChips + timeChipBonus
    description = `Buy-in + Opcional: ${tournament.name}`
  } else {
    baseForRake = base
    taxForHouse = 0
    chips = tournament.startingChips + timeChipBonus
    description = `Buy-in: ${tournament.name}`
  }

  const totalCharge = baseForRake + taxForHouse
  const prizeIncrement = baseForRake * (1 - rakeRate)
  const rakeIncrement = baseForRake * rakeRate

  const tournamentPlayer = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const tp = await tx.tournamentPlayer.create({
      data: {
        tournamentId,
        playerId,
        comandaId: comanda!.id,
        // Buy-in duplo conta como 1 rebuy (fichas extras desde o início)
        ...(buyInType === 'DOUBLE' ? { rebuysCount: 1 } : {}),
        timeChipAwarded,
        buyInChips: chips,
      },
      include: { player: { select: { id: true, name: true } } },
    })

    const item = await tx.comandaItem.create({
      data: {
        comandaId: comanda!.id,
        type: 'TOURNAMENT_BUYIN',
        amount: totalCharge,
        description,
        tournamentId,
        tournamentPlayerId: tp.id,
        createdByUserId: registeredByUserId,
      },
    })

    await tx.comanda.update({
      where: { id: comanda!.id },
      data: { balance: { decrement: totalCharge } },
    })

    // Se o método de pagamento foi informado, registra o crédito na comanda imediatamente.
    // Isso zera o saldo do jogador (débito buy-in + crédito pagamento = 0).
    if (paymentMethod) {
      const paymentItemType =
        paymentMethod === 'PIX' ? 'PAYMENT_PIX_SPOT'
        : paymentMethod === 'CARD' ? 'PAYMENT_CARD'
        : 'PAYMENT_CASH'  // CASH e VOUCHER usam PAYMENT_CASH
      const paymentDesc =
        paymentMethod === 'VOUCHER' ? 'Vale'
        : paymentMethod === 'PIX' ? null
        : null

      await tx.comandaItem.create({
        data: {
          comandaId: comanda!.id,
          type: paymentItemType,
          amount: totalCharge,
          description: paymentDesc,
          paymentStatus: 'PAID',  // sempre PAID — o operador está confirmando recebimento
          tournamentId,
          tournamentPlayerId: tp.id,
          createdByUserId: registeredByUserId,
        },
      })

      await tx.comanda.update({
        where: { id: comanda!.id },
        data: { balance: { increment: totalCharge } },
      })
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        prizePool: { increment: prizeIncrement },
        totalRake: { increment: rakeIncrement },
        totalTax: { increment: taxForHouse },
        totalChipsInPlay: { increment: chips },
      },
    })

    return { ...tp, comandaItem: item, chips, buyInType }
  })

  return tournamentPlayer
}

// ─── Cancel registration ─────────────────────────────────────────────────────

export async function cancelRegistration({
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

  if (tp.tournament.status !== 'REGISTRATION') {
    throw new Error('Só é possível cancelar inscrição antes do torneio iniciar')
  }

  const buyInItem = await db.comandaItem.findFirst({
    where: { tournamentPlayerId, type: 'TOURNAMENT_BUYIN' },
  })

  // Determina quanto era base e quanto era taxa para reverter corretamente
  const totalCharged = Number(buyInItem?.amount ?? 0)
  const rakeRate = Number(tp.tournament.rake) / 100
  const description = buyInItem?.description ?? ''
  // Inferir taxa a partir da descrição
  const wasWithTax = description.includes('Opcional') || description.includes('Duplo')
  const taxAmount = wasWithTax
    ? description.includes('Duplo')
      ? Number(tp.tournament.buyInTaxAmount ?? 0)
      : Number(tp.tournament.buyInTaxAmount ?? 0)
    : 0
  const baseCharged = totalCharged - taxAmount
  const prizeToRevert = baseCharged * (1 - rakeRate)
  const rakeToRevert = baseCharged * rakeRate

  // Busca itens de pagamento vinculados ao tournamentPlayerId
  // (CASH, CARD, PIX gerados no momento da inscrição ou via pix-charge)
  const paymentItems = await db.comandaItem.findMany({
    where: {
      tournamentPlayerId,
      type: { in: ['PAYMENT_CASH', 'PAYMENT_CARD', 'PAYMENT_PIX_SPOT', 'PAYMENT_PIX_TERM'] },
    },
  })
  const paymentTotal = paymentItems.reduce((sum, i) => sum + Number(i.amount), 0)

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Estorna o buy-in na comanda
    if (buyInItem) {
      await tx.comanda.update({
        where: { id: tp.comandaId },
        data: { balance: { increment: totalCharged } },
      })
      await tx.comandaItem.delete({ where: { id: buyInItem.id } })
    }

    // Estorna os itens de pagamento (créditos gerados no momento da inscrição)
    if (paymentItems.length > 0) {
      await tx.comanda.update({
        where: { id: tp.comandaId },
        data: { balance: { decrement: paymentTotal } },
      })
      await tx.comandaItem.deleteMany({
        where: { id: { in: paymentItems.map((i) => i.id) } },
      })
    }

    // Reverte prize pool, rake, taxa e fichas em jogo
    await tx.tournament.update({
      where: { id: tp.tournamentId },
      data: {
        prizePool: { decrement: prizeToRevert },
        totalRake: { decrement: rakeToRevert },
        totalTax: { decrement: taxAmount },
        totalChipsInPlay: { decrement: tp.buyInChips },
      },
    })

    // Remove o jogador do torneio
    await tx.tournamentPlayer.delete({ where: { id: tournamentPlayerId } })
  })

  return { ok: true }
}

// ─── Rebuy ────────────────────────────────────────────────────────────────────

export async function registerRebuy({
  tournamentPlayerId,
  registeredByUserId,
  rebuyType = 'NORMAL',
}: {
  tournamentPlayerId: string
  registeredByUserId: string
  rebuyType?: 'NORMAL' | 'NORMAL_WITH_TAX' | 'DOUBLE'
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

  const base = Number(tp.tournament.rebuyAmount)
  const taxUnit = Number(tp.tournament.rebuyTaxAmount ?? 0)
  const taxChipsUnit = Number(tp.tournament.rebuyTaxChips ?? 0)
  const baseChips = tp.tournament.rebuyChips ?? tp.tournament.startingChips
  const rebuyBonusChips = Number(tp.tournament.doubleRebuyBonusChips ?? 0)
  const rakeRate = Number(tp.tournament.rake) / 100

  let baseForRake: number
  let taxForHouse: number
  let totalChips: number
  let description: string

  if (rebuyType === 'DOUBLE') {
    baseForRake = base * 2
    taxForHouse = taxUnit * 2
    totalChips = (baseChips + taxChipsUnit) * 2 + rebuyBonusChips
    description = `Rebuy Duplo`
  } else if (rebuyType === 'NORMAL_WITH_TAX' && taxUnit > 0) {
    baseForRake = base
    taxForHouse = taxUnit
    totalChips = baseChips + taxChipsUnit
    description = `Rebuy + Opcional`
  } else {
    baseForRake = base
    taxForHouse = 0
    totalChips = baseChips
    description = `Rebuy`
  }

  const totalCharge = baseForRake + taxForHouse
  const prizeIncrement = baseForRake * (1 - rakeRate)
  const rakeIncrement = baseForRake * rakeRate

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.tournamentPlayer.update({
      where: { id: tournamentPlayerId },
      data: { rebuysCount: { increment: rebuyType === 'DOUBLE' ? 2 : 1 } },
    })

    await tx.comandaItem.create({
      data: {
        comandaId: tp.comanda.id,
        type: 'TOURNAMENT_REBUY',
        amount: totalCharge,
        description: `${description} #${updated.rebuysCount}: ${tp.tournament.name}`,
        tournamentId: tp.tournamentId,
        tournamentPlayerId,
        createdByUserId: registeredByUserId,
      },
    })

    await tx.comanda.update({
      where: { id: tp.comanda.id },
      data: { balance: { decrement: totalCharge } },
    })

    await tx.tournament.update({
      where: { id: tp.tournamentId },
      data: {
        prizePool: { increment: prizeIncrement },
        totalRake: { increment: rakeIncrement },
        totalTax: { increment: taxForHouse },
        totalChipsInPlay: { increment: totalChips },
      },
    })

    return { ...updated, chips: totalChips, rebuyType }
  })
}

// ─── Re-entry (eliminado volta ao torneio via rebuy) ─────────────────────────

export async function reEntryPlayer({
  tournamentPlayerId,
  reEntryType = 'NORMAL',
  withAddon = false,
  registeredByUserId,
}: {
  tournamentPlayerId: string
  reEntryType?: 'NORMAL' | 'DOUBLE'
  withAddon?: boolean
  registeredByUserId: string
}) {
  const tp = await db.tournamentPlayer.findUniqueOrThrow({
    where: { id: tournamentPlayerId },
    include: { tournament: true, comanda: true },
  })

  if (tp.status !== 'ELIMINATED') throw new Error('Jogador não está eliminado')
  if (!tp.tournament.rebuyAmount) throw new Error('Torneio não permite re-entrada (sem rebuy)')
  if (
    tp.tournament.rebuyUntilLevel !== null &&
    tp.tournament.currentLevel > tp.tournament.rebuyUntilLevel
  ) {
    throw new Error('Período de re-entrada encerrado')
  }

  const rebuyBase = Number(tp.tournament.rebuyAmount)
  const rebuyTaxUnit = Number(tp.tournament.rebuyTaxAmount ?? 0)
  const rebuyBaseChips = tp.tournament.rebuyChips ?? tp.tournament.startingChips
  const rakeRate = Number(tp.tournament.rake) / 100

  const rebuysToAdd = reEntryType === 'DOUBLE' ? 2 : 1
  const rebuyBaseTotal = rebuyBase * rebuysToAdd
  const rebuyTaxTotal = rebuyTaxUnit * rebuysToAdd
  const rebuyTotalCharge = rebuyBaseTotal + rebuyTaxTotal
  const rebuyTotalChips = rebuyBaseChips * rebuysToAdd
  const rebuyPrizeIncrement = rebuyBaseTotal * (1 - rakeRate)
  const rebuyRakeIncrement = rebuyBaseTotal * rakeRate

  // Addon durante re-entrada
  let addonCharge = 0
  let addonTotalChips = 0
  let addonPrizeIncrement = 0
  let addonRakeIncrement = 0
  const addonAvailable =
    withAddon &&
    !!tp.tournament.addonAmount &&
    !tp.hasAddon &&
    (tp.tournament.addonAfterLevel === null || tp.tournament.currentLevel >= tp.tournament.addonAfterLevel)

  if (withAddon && !addonAvailable) {
    if (tp.hasAddon) throw new Error('Jogador já fez add-on')
    if (!tp.tournament.addonAmount) throw new Error('Torneio não tem add-on')
    throw new Error('Add-on ainda não disponível neste nível')
  }

  if (addonAvailable) {
    addonCharge = Number(tp.tournament.addonAmount)
    addonTotalChips = tp.tournament.addonChips ?? tp.tournament.startingChips
    addonPrizeIncrement = addonCharge * (1 - rakeRate)
    addonRakeIncrement = addonCharge * rakeRate
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Reverte prêmio automático que possa ter sido creditado ao ser eliminado
    const prizeItem = await tx.comandaItem.findFirst({
      where: { tournamentPlayerId, type: 'TOURNAMENT_PRIZE' },
      orderBy: { createdAt: 'desc' },
    })
    if (prizeItem) {
      const prizeAmt = Number(prizeItem.amount)
      await tx.comandaItem.delete({ where: { id: prizeItem.id } })
      await tx.comanda.update({
        where: { id: tp.comanda.id },
        data: { balance: { decrement: prizeAmt } },
      })
    }

    // Reativa jogador
    await tx.tournamentPlayer.update({
      where: { id: tournamentPlayerId },
      data: {
        status: 'ACTIVE',
        position: null,
        eliminatedAt: null,
        eliminatedAtLevel: null,
        eliminatedByPlayerId: null,
        prizeAmount: null,
        rebuysCount: { increment: rebuysToAdd },
        ...(addonAvailable ? { hasAddon: true } : {}),
      },
    })

    // Cobra rebuy na comanda
    await tx.comandaItem.create({
      data: {
        comandaId: tp.comanda.id,
        type: 'TOURNAMENT_REBUY',
        amount: rebuyTotalCharge,
        description: reEntryType === 'DOUBLE'
          ? `Re-entrada Dupla: ${tp.tournament.name}`
          : `Re-entrada: ${tp.tournament.name}`,
        tournamentId: tp.tournamentId,
        tournamentPlayerId,
        createdByUserId: registeredByUserId,
      },
    })
    await tx.comanda.update({
      where: { id: tp.comanda.id },
      data: { balance: { decrement: rebuyTotalCharge } },
    })
    await tx.tournament.update({
      where: { id: tp.tournamentId },
      data: {
        prizePool: { increment: rebuyPrizeIncrement },
        totalRake: { increment: rebuyRakeIncrement },
        totalTax: { increment: rebuyTaxTotal },
        totalChipsInPlay: { increment: rebuyTotalChips },
      },
    })

    // Cobra addon se solicitado
    if (addonAvailable && addonCharge > 0) {
      await tx.comandaItem.create({
        data: {
          comandaId: tp.comanda.id,
          type: 'TOURNAMENT_ADDON',
          amount: addonCharge,
          description: `Add-on: ${tp.tournament.name}`,
          tournamentId: tp.tournamentId,
          tournamentPlayerId,
          createdByUserId: registeredByUserId,
        },
      })
      await tx.comanda.update({
        where: { id: tp.comanda.id },
        data: { balance: { decrement: addonCharge } },
      })
      await tx.tournament.update({
        where: { id: tp.tournamentId },
        data: {
          prizePool: { increment: addonPrizeIncrement },
          totalRake: { increment: addonRakeIncrement },
          totalChipsInPlay: { increment: addonTotalChips },
        },
      })
    }

    return {
      chips: rebuyTotalChips + addonTotalChips,
      reEntryType,
      withAddon: addonAvailable,
    }
  })
}

// ─── Addon ────────────────────────────────────────────────────────────────────

export async function registerAddon({
  tournamentPlayerId,
  registeredByUserId,
  withTax = false,
}: {
  tournamentPlayerId: string
  registeredByUserId: string
  withTax?: boolean
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

  const base = Number(tp.tournament.addonAmount)
  const taxAmount = withTax ? Number(tp.tournament.addonTaxAmount ?? 0) : 0
  const taxChips = withTax ? Number(tp.tournament.addonTaxChips ?? 0) : 0
  const rakeRate = Number(tp.tournament.rake) / 100
  const totalCharge = base + taxAmount
  const totalChips = (tp.tournament.addonChips ?? tp.tournament.startingChips) + taxChips
  // Rake só sobre o valor base; taxa vai integral para a casa
  const prizeIncrement = base * (1 - rakeRate)
  const rakeIncrement = base * rakeRate

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.tournamentPlayer.update({
      where: { id: tournamentPlayerId },
      data: { hasAddon: true },
    })

    await tx.comandaItem.create({
      data: {
        comandaId: tp.comanda.id,
        type: 'TOURNAMENT_ADDON',
        amount: totalCharge,
        description: withTax
          ? `Add-on + Opcional: ${tp.tournament.name}`
          : `Add-on: ${tp.tournament.name}`,
        tournamentId: tp.tournamentId,
        tournamentPlayerId,
        createdByUserId: registeredByUserId,
      },
    })

    await tx.comanda.update({
      where: { id: tp.comanda.id },
      data: { balance: { decrement: totalCharge } },
    })

    await tx.tournament.update({
      where: { id: tp.tournamentId },
      data: {
        prizePool: { increment: prizeIncrement },
        totalRake: { increment: rakeIncrement },
        totalTax: { increment: taxAmount },
        totalChipsInPlay: { increment: totalChips },
      },
    })

    return { ...updated, chips: totalChips, withTax }
  })
}

// ─── Eliminate player ─────────────────────────────────────────────────────────

export async function eliminatePlayer({
  tournamentPlayerId,
  eliminatedByPlayerId,
  registeredByUserId,
}: {
  tournamentPlayerId: string
  eliminatedByPlayerId?: string | null
  registeredByUserId: string
}) {
  const tp = await db.tournamentPlayer.findUniqueOrThrow({
    where: { id: tournamentPlayerId },
    include: { tournament: true, comanda: true },
  })

  if (tp.status === 'ELIMINATED') throw new Error('Jogador já eliminado')

  // Posição = nº de jogadores ainda ativos no momento da eliminação
  const activeCount = await db.tournamentPlayer.count({
    where: { tournamentId: tp.tournamentId, status: { in: ['REGISTERED', 'ACTIVE'] } },
  })
  const position = activeCount // ex: 6 ativos → eliminado em 6º

  // Calcula se esse position recebe prêmio
  // Se o torneio tem dealPayouts (acordo de posições), usa esses valores; senão usa calcPayoutSuggestion
  const totalPlayers = await db.tournamentPlayer.count({ where: { tournamentId: tp.tournamentId } })
  const prizePool = Number(tp.tournament.prizePool)

  // Estrutura de premiação efetiva:
  // 1. dealPayouts (acordo explícito com valores) → usa diretamente
  // 2. payoutStructure (estrutura configurada com percentuais) → calcula valores
  // 3. fallback: calcPayoutSuggestion
  let effectivePayouts: { position: number; amount: number }[]
  if (tp.tournament.dealPayouts) {
    try {
      effectivePayouts = JSON.parse(tp.tournament.dealPayouts)
    } catch {
      effectivePayouts = calcPayoutSuggestion(prizePool, totalPlayers)
    }
  } else if (tp.tournament.payoutStructure) {
    try {
      const structure: { position: number; percent: number }[] = JSON.parse(tp.tournament.payoutStructure)
      effectivePayouts = structure.map((s) => ({
        position: s.position,
        amount: Math.round(prizePool * s.percent / 100 * 100) / 100,
      }))
    } catch {
      effectivePayouts = calcPayoutSuggestion(prizePool, totalPlayers)
    }
  } else {
    effectivePayouts = calcPayoutSuggestion(prizePool, totalPlayers)
  }
  const prizeEntry = effectivePayouts.find((p) => p.position === position)

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Marca eliminado com posição calculada
    const eliminated = await tx.tournamentPlayer.update({
      where: { id: tournamentPlayerId },
      data: {
        status: 'ELIMINATED',
        eliminatedAt: new Date(),
        eliminatedAtLevel: tp.tournament.currentLevel,
        eliminatedByPlayerId: eliminatedByPlayerId ?? null,
        position,
      },
    })

    // Auto-prêmio se posição está na estrutura de pagamento
    if (prizeEntry && prizeEntry.amount > 0) {
      await tx.tournamentPlayer.update({
        where: { id: tournamentPlayerId },
        data: { prizeAmount: prizeEntry.amount },
      })
      await tx.comandaItem.create({
        data: {
          comandaId: tp.comanda.id,
          type: 'TOURNAMENT_PRIZE',
          amount: prizeEntry.amount,
          description: `Prêmio ${position}º lugar: ${tp.tournament.name}`,
          tournamentId: tp.tournamentId,
          tournamentPlayerId,
          createdByUserId: registeredByUserId,
        },
      })
      await tx.comanda.update({
        where: { id: tp.comanda.id },
        data: { balance: { increment: prizeEntry.amount } },
      })
    }

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

    // Verifica se restou apenas 1 ativo → finaliza torneio e premia vencedor
    const activePlayers = await tx.tournamentPlayer.count({
      where: {
        tournamentId: tp.tournamentId,
        status: { in: ['REGISTERED', 'ACTIVE'] },
      },
    })
    if (activePlayers <= 1) {
      const winner = await tx.tournamentPlayer.findFirst({
        where: { tournamentId: tp.tournamentId, status: { in: ['REGISTERED', 'ACTIVE'] } },
        include: { comanda: true },
      })
      if (winner) {
        // Soma todos os prizeAmounts já creditados (acordos parciais, posições eliminadas, etc.)
        // para calcular o pot restante que ainda não foi distribuído.
        const savedAgg = await tx.tournamentPlayer.aggregate({
          where: { tournamentId: tp.tournamentId },
          _sum: { prizeAmount: true },
        })
        const totalAlreadySaved = Number(savedAgg._sum.prizeAmount ?? 0)
        const remainingPot = Math.max(0, Math.round((prizePool - totalAlreadySaved) * 100) / 100)

        // Total final do vencedor = o que já tinha salvo + o pot restante
        const winnerCurrentPrize = Number(winner.prizeAmount ?? 0)
        const winnerTotalPrize = Math.round((winnerCurrentPrize + remainingPot) * 100) / 100

        await tx.tournamentPlayer.update({
          where: { id: winner.id },
          data: {
            status: 'WINNER',
            position: 1,
            ...(winnerTotalPrize > 0 ? { prizeAmount: winnerTotalPrize } : {}),
          },
        })
        // Cria item na comanda apenas pelo valor incremental (evita creditar novamente o que já foi salvo)
        if (remainingPot > 0) {
          await tx.comandaItem.create({
            data: {
              comandaId: winner.comanda.id,
              type: 'TOURNAMENT_PRIZE',
              amount: remainingPot,
              description: `Prêmio 1º lugar: ${tp.tournament.name}`,
              tournamentId: tp.tournamentId,
              tournamentPlayerId: winner.id,
              createdByUserId: registeredByUserId,
            },
          })
          await tx.comanda.update({
            where: { id: winner.comanda.id },
            data: { balance: { increment: remainingPot } },
          })
        }
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

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

export async function previousLevel(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (!['RUNNING', 'ON_BREAK'].includes(t.status)) throw new Error('Torneio não está em andamento')
  if (t.currentLevel <= 1) throw new Error('Já está no primeiro nível')

  return db.tournament.update({
    where: { id: tournamentId },
    data: {
      currentLevel: t.currentLevel - 1,
      levelStartedAt: new Date(),
      isOnBreak: false,
      breakStartedAt: null,
      isPaused: false,
      pausedAt: null,
    },
  })
}

export async function advanceLevel(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: { blindLevels: { orderBy: { level: 'asc' } } },
  })
  if (t.status !== 'RUNNING') throw new Error('Torneio não está rodando')

  // Se há intervalo agendado após o nível atual, entra em break em vez de avançar
  const breaks: { afterLevel: number; durationMinutes: number }[] = (() => {
    try { return JSON.parse(t.breaks ?? '[]') } catch { return [] }
  })()
  const breakAfterCurrent = breaks.find((b) => b.afterLevel === t.currentLevel)
  if (breakAfterCurrent) {
    return db.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'ON_BREAK',
        isOnBreak: true,
        breakStartedAt: new Date(),
        isPaused: false,
        pausedAt: null,
      },
    })
  }

  const nextLevel = t.currentLevel + 1
  const maxLevel = t.blindLevels[t.blindLevels.length - 1]?.level ?? nextLevel

  return db.tournament.update({
    where: { id: tournamentId },
    data: {
      currentLevel: Math.min(nextLevel, maxLevel),
      levelStartedAt: new Date(),
      isOnBreak: false,
      breakStartedAt: null,
      isPaused: false,
      pausedAt: null,
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
      isPaused: false,
      pausedAt: null,
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
      isPaused: false,
      pausedAt: null,
    },
  })
}

export async function pauseTimer(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (!['RUNNING', 'ON_BREAK'].includes(t.status)) throw new Error('Torneio não está em andamento')
  if (t.isPaused) throw new Error('Timer já está pausado')

  return db.tournament.update({
    where: { id: tournamentId },
    data: { isPaused: true, pausedAt: new Date() },
  })
}

export async function resumeTimer(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (!t.isPaused || !t.pausedAt) throw new Error('Timer não está pausado')

  const pauseDurationMs = Date.now() - t.pausedAt.getTime()

  // Avança o startedAt do nível/break pelo tempo pausado, mantendo o remaining igual
  const data: Record<string, unknown> = { isPaused: false, pausedAt: null }
  if (t.isOnBreak && t.breakStartedAt) {
    data.breakStartedAt = new Date(t.breakStartedAt.getTime() + pauseDurationMs)
  } else if (t.levelStartedAt) {
    data.levelStartedAt = new Date(t.levelStartedAt.getTime() + pauseDurationMs)
  }

  return db.tournament.update({ where: { id: tournamentId }, data })
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
    await db.tournament.update({
      where: { id: tournamentId },
      data: { breaks: JSON.stringify(breaks) },
    })
  }
}

// Salva acordo de posições — redistribui prêmios por colocação sem encerrar o torneio
// Os jogadores vão receber o valor acordado quando forem eliminados/vencerem
export async function setDealPayouts(
  tournamentId: string,
  payouts: { position: number; amount: number }[],
) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (!['RUNNING', 'ON_BREAK'].includes(t.status)) throw new Error('Torneio não está em andamento')
  if (!payouts.length) throw new Error('Nenhum pagamento definido')
  return db.tournament.update({
    where: { id: tournamentId },
    data: { dealPayouts: JSON.stringify(payouts) },
  })
}

// Salva estrutura de payout configurada no modal (posições + percentuais)
// Usada pelo clock para exibir a distribuição correta de prêmios
export async function setPayoutStructure(
  tournamentId: string,
  structure: { position: number; percent: number }[],
) {
  if (!structure.length) throw new Error('Estrutura vazia')
  return db.tournament.update({
    where: { id: tournamentId },
    data: { payoutStructure: JSON.stringify(structure) },
  })
}

// Force-finish por acordo — atribui posições aos jogadores ativos (por prêmio desc) e encerra
export async function finishByDeal(tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })
  if (!['RUNNING', 'ON_BREAK'].includes(t.status)) throw new Error('Torneio não está em andamento')

  const activePlayers = await db.tournamentPlayer.findMany({
    where: { tournamentId, status: { in: ['REGISTERED', 'ACTIVE'] } },
  })

  // Ordena por prêmio decrescente: quem recebeu mais → posição mais alta
  const sorted = [...activePlayers].sort(
    (a, b) => Number(b.prizeAmount ?? 0) - Number(a.prizeAmount ?? 0)
  )

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i]
      const isWinner = i === 0
      await tx.tournamentPlayer.update({
        where: { id: p.id },
        data: {
          status: isWinner ? 'WINNER' : 'ELIMINATED',
          position: i + 1,
          eliminatedAt: isWinner ? undefined : new Date(),
          eliminatedAtLevel: isWinner ? undefined : t.currentLevel,
        },
      })
    }
    return tx.tournament.update({
      where: { id: tournamentId },
      data: { status: 'FINISHED', finishedAt: new Date(), isPaused: false, pausedAt: null },
    })
  })
}

export async function cancelTournament(tournamentId: string) {
  return db.tournament.update({
    where: { id: tournamentId },
    data: { status: 'CANCELED', finishedAt: new Date() },
  })
}

// ─── Payout structure ─────────────────────────────────────────────────────────

export function calcPayoutSuggestion(prizePool: number, playerCount: number): Array<{ position: number; amount: number; percent: number }> {
  if (playerCount < 3) return [{ position: 1, amount: prizePool, percent: 100 }]

  // Torneios pequenos: garante no mínimo 2 posições premiadas até 9 jogadores
  // 10+: top ~20% do campo (mínimo 3)
  const paid = playerCount <= 9
    ? Math.min(playerCount - 1, Math.max(2, Math.ceil(playerCount * 0.33)))
    : Math.max(3, Math.ceil(playerCount * 0.2))

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

// ─── Event tournaments ────────────────────────────────────────────────────────

export async function createEventTournament(input: {
  eventId: string
  requesterId: string
  name: string
  buyInAmount: number
  rebuyAmount?: number | null
  addonAmount?: number | null
  bountyAmount?: number | null
  rake?: number
  startingChips: number
  rebuyChips?: number | null
  addonChips?: number | null
  buyInTaxAmount?: number | null
  buyInTaxChips?: number | null
  rebuyTaxAmount?: number | null
  rebuyTaxChips?: number | null
  addonTaxAmount?: number | null
  addonTaxChips?: number | null
  lateRegistrationLevel?: number | null
  rebuyUntilLevel?: number | null
  addonAfterLevel?: number | null
  minutesPerLevelPreLateReg: number
  minutesPerLevelPostLateReg?: number | null
  breaks?: { afterLevel: number; durationMinutes: number }[]
  blindTemplateName?: string | null
  blindLevels?: BlindLevel[]
  doubleBuyInBonusChips?: number | null
  doubleRebuyEnabled?: boolean
  doubleRebuyBonusChips?: number | null
  staffRetentionPct?: number | null
  staffRetentionDest?: string | null
  rankingRetentionPct?: number | null
  timeChipBonus?: number | null
  timeChipUntilLevel?: number | null
}) {
  if (!(await isEventStaff(input.requesterId, input.eventId))) {
    throw new Error('Apenas staff do evento pode criar torneios')
  }

  let levels = input.blindLevels
  if (!levels || levels.length === 0) {
    if (input.blindTemplateName && BLIND_TEMPLATES[input.blindTemplateName]) {
      levels = BLIND_TEMPLATES[input.blindTemplateName]
    }
  }

  return db.tournament.create({
    data: {
      eventId: input.eventId,
      name: input.name,
      buyInAmount: input.buyInAmount,
      rebuyAmount: input.rebuyAmount ?? null,
      addonAmount: input.addonAmount ?? null,
      bountyAmount: input.bountyAmount ?? null,
      rake: input.rake ?? 0,
      startingChips: input.startingChips,
      rebuyChips: input.rebuyChips ?? null,
      addonChips: input.addonChips ?? null,
      buyInTaxAmount: input.buyInTaxAmount ?? null,
      buyInTaxChips: input.buyInTaxChips ?? null,
      rebuyTaxAmount: input.rebuyTaxAmount ?? null,
      rebuyTaxChips: input.rebuyTaxChips ?? null,
      addonTaxAmount: input.addonTaxAmount ?? null,
      addonTaxChips: input.addonTaxChips ?? null,
      lateRegistrationLevel: input.lateRegistrationLevel ?? null,
      rebuyUntilLevel: input.rebuyUntilLevel ?? null,
      addonAfterLevel: input.addonAfterLevel ?? null,
      minutesPerLevelPreLateReg: input.minutesPerLevelPreLateReg,
      minutesPerLevelPostLateReg: input.minutesPerLevelPostLateReg ?? null,
      blindTemplateName: input.blindTemplateName ?? null,
      doubleBuyInBonusChips: input.doubleBuyInBonusChips ?? null,
      doubleRebuyEnabled: input.doubleRebuyEnabled ?? false,
      doubleRebuyBonusChips: input.doubleRebuyBonusChips ?? null,
      staffRetentionPct: input.staffRetentionPct ?? null,
      staffRetentionDest: input.staffRetentionDest ?? null,
      rankingRetentionPct: input.rankingRetentionPct ?? null,
      timeChipBonus: input.timeChipBonus ?? null,
      timeChipUntilLevel: input.timeChipUntilLevel ?? null,
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
      breaks: input.breaks ? JSON.stringify(input.breaks) : JSON.stringify([]),
    },
  })
}

export async function listTournamentsByEvent(eventId: string, status?: TournamentStatus) {
  return db.tournament.findMany({
    where: { eventId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { players: true } } },
  })
}
