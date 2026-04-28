import { prisma } from '../../lib/prisma'
import { Prisma, ComandaItemType, DailyCloseStatus } from '@prisma/client'
import { assertEventHost, assertEventCashier } from '../../lib/event-auth'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Tipos que representam saida de caixa (dinheiro sai do evento para o jogador)
const OUT_TYPES: ComandaItemType[] = [
  ComandaItemType.CASH_CASHOUT,
  ComandaItemType.TOURNAMENT_PRIZE,
  ComandaItemType.TRANSFER_OUT,
]

// Tipos que representam entrada de caixa (jogador deposita fichas)
const IN_TYPES: ComandaItemType[] = [
  ComandaItemType.CASH_BUYIN,
  ComandaItemType.CASH_REBUY,
  ComandaItemType.CASH_ADDON,
  ComandaItemType.TOURNAMENT_BUYIN,
  ComandaItemType.TOURNAMENT_REBUY,
  ComandaItemType.TOURNAMENT_ADDON,
  ComandaItemType.TRANSFER_IN,
]

const PIX_TYPES: ComandaItemType[] = [
  ComandaItemType.PAYMENT_PIX_SPOT,
  ComandaItemType.PAYMENT_PIX_TERM,
]

const CASH_TYPES: ComandaItemType[] = [
  ComandaItemType.PAYMENT_CASH,
]

function sumItems(items: { amount: Prisma.Decimal }[]): Prisma.Decimal {
  return items.reduce(
    (acc, i) => acc.plus(i.amount),
    new Prisma.Decimal(0)
  )
}

/**
 * Busca todos os ComandaItem de um evento para uma data especifica.
 * Filtra pelas comandas do evento e agrupa pelo dia de createdAt (UTC date).
 */
async function fetchItemsForDate(eventId: string, date: Date) {
  const startOfDay = new Date(date)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(date)
  endOfDay.setUTCHours(23, 59, 59, 999)

  return prisma.comandaItem.findMany({
    where: {
      comanda: { eventId },
      createdAt: { gte: startOfDay, lte: endOfDay },
      // Itens de estorno nao entram no calculo
      reversalOfId: null,
      reversal: null,
    },
    select: {
      id: true,
      type: true,
      amount: true,
      description: true,
      createdAt: true,
      comanda: { select: { playerId: true, player: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

function computeTotals(items: { type: ComandaItemType; amount: Prisma.Decimal }[]) {
  const inItems = items.filter((i) => IN_TYPES.includes(i.type))
  const outItems = items.filter((i) => OUT_TYPES.includes(i.type))
  const pixItems = items.filter((i) => PIX_TYPES.includes(i.type))
  const cashItems = items.filter((i) => CASH_TYPES.includes(i.type))

  return {
    totalIn: sumItems(inItems),
    totalOut: sumItems(outItems),
    totalPix: sumItems(pixItems),
    totalCash: sumItems(cashItems),
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function listDailyCloses(eventId: string, requesterId: string) {
  await assertEventCashier(requesterId, eventId)
  return prisma.eventDailyClose.findMany({
    where: { eventId },
    include: {
      closedBy: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
  })
}

export async function getDailyClose(eventId: string, dailyCloseId: string, requesterId: string) {
  await assertEventCashier(requesterId, eventId)

  const dailyClose = await prisma.eventDailyClose.findUnique({
    where: { id: dailyCloseId },
    include: { closedBy: { select: { id: true, name: true } } },
  })
  if (!dailyClose || dailyClose.eventId !== eventId) {
    throw new Error('Fechamento nao encontrado')
  }

  // Se ainda em aberto, calcula os totais ao vivo
  if (dailyClose.status === DailyCloseStatus.OPEN) {
    const items = await fetchItemsForDate(eventId, dailyClose.date)
    const totals = computeTotals(items)
    return { ...dailyClose, liveItems: items, liveTotals: totals }
  }

  return dailyClose
}

export async function getOrCreateDailyClose(eventId: string, date: Date, requesterId: string) {
  await assertEventCashier(requesterId, eventId)

  // Normaliza para meia-noite UTC do dia informado
  const normalizedDate = new Date(date)
  normalizedDate.setUTCHours(0, 0, 0, 0)

  const existing = await prisma.eventDailyClose.findUnique({
    where: { eventId_date: { eventId, date: normalizedDate } },
    include: { closedBy: { select: { id: true, name: true } } },
  })
  if (existing) return existing

  return prisma.eventDailyClose.create({
    data: { eventId, date: normalizedDate },
    include: { closedBy: { select: { id: true, name: true } } },
  })
}

export async function getDailySummary(eventId: string, date: Date, requesterId: string) {
  await assertEventCashier(requesterId, eventId)

  const normalizedDate = new Date(date)
  normalizedDate.setUTCHours(0, 0, 0, 0)

  const items = await fetchItemsForDate(eventId, normalizedDate)
  const totals = computeTotals(items)

  return { date: normalizedDate, items, totals }
}

export async function closeDailyClose(
  eventId: string,
  dailyCloseId: string,
  requesterId: string,
  notes?: string
) {
  await assertEventCashier(requesterId, eventId)

  const dailyClose = await prisma.eventDailyClose.findUnique({
    where: { id: dailyCloseId },
    select: { id: true, eventId: true, status: true, date: true },
  })
  if (!dailyClose || dailyClose.eventId !== eventId) {
    throw new Error('Fechamento nao encontrado')
  }
  if (dailyClose.status === DailyCloseStatus.CLOSED) {
    throw new Error('Este fechamento ja foi encerrado')
  }

  // Calcula totais no momento do fechamento (snapshot imutavel)
  const items = await fetchItemsForDate(eventId, dailyClose.date)
  const totals = computeTotals(items)

  return prisma.eventDailyClose.update({
    where: { id: dailyCloseId },
    data: {
      status: DailyCloseStatus.CLOSED,
      closedByUserId: requesterId,
      closedAt: new Date(),
      notes,
      totalIn: totals.totalIn,
      totalOut: totals.totalOut,
      totalPix: totals.totalPix,
      totalCash: totals.totalCash,
    },
    include: { closedBy: { select: { id: true, name: true } } },
  })
}

export async function reopenDailyClose(eventId: string, dailyCloseId: string, requesterId: string) {
  // Reabrir exige permissao de HOST (nao so cashier)
  await assertEventHost(requesterId, eventId)

  const dailyClose = await prisma.eventDailyClose.findUnique({
    where: { id: dailyCloseId },
    select: { id: true, eventId: true, status: true },
  })
  if (!dailyClose || dailyClose.eventId !== eventId) {
    throw new Error('Fechamento nao encontrado')
  }
  if (dailyClose.status === DailyCloseStatus.OPEN) {
    throw new Error('Este fechamento ja esta em aberto')
  }

  return prisma.eventDailyClose.update({
    where: { id: dailyCloseId },
    data: {
      status: DailyCloseStatus.OPEN,
      closedByUserId: null,
      closedAt: null,
      totalIn: null,
      totalOut: null,
      totalPix: null,
      totalCash: null,
    },
    include: { closedBy: { select: { id: true, name: true } } },
  })
}
