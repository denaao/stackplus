import { prisma } from '../../lib/prisma'

// Types defined locally until `npx prisma generate` is run with the new schema
type ComandaMode = 'PREPAID' | 'POSTPAID'
type ComandaItemType =
  | 'CASH_BUYIN' | 'CASH_REBUY' | 'CASH_ADDON' | 'CASH_CASHOUT'
  | 'TOURNAMENT_BUYIN' | 'TOURNAMENT_REBUY' | 'TOURNAMENT_ADDON'
  | 'TOURNAMENT_BOUNTY_RECEIVED' | 'TOURNAMENT_PRIZE'
  | 'PAYMENT_PIX_SPOT' | 'PAYMENT_PIX_TERM' | 'PAYMENT_CASH' | 'PAYMENT_CARD'
  | 'TRANSFER_IN' | 'TRANSFER_OUT'
type ComandaItemPaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

// ─── Open ────────────────────────────────────────────────────────────────────

export async function openComanda({
  playerId,
  homeGameId,
  mode,
  creditLimit,
  note,
  openedByUserId,
}: {
  playerId: string
  homeGameId: string
  mode?: ComandaMode
  creditLimit?: number | null
  note?: string
  openedByUserId: string
}) {
  // Garante que não existe comanda OPEN para o mesmo jogador/home game
  const existing = await db.comanda.findFirst({
    where: { playerId, homeGameId, status: 'OPEN' },
  })
  if (existing) {
    throw new Error('Jogador já possui uma comanda aberta neste home game')
  }

  return db.comanda.create({
    data: {
      playerId,
      homeGameId,
      mode: mode ?? 'PREPAID',
      creditLimit: creditLimit ?? null,
      note: note ?? null,
      openedByUserId,
    },
    include: {
      player: { select: { id: true, name: true, cpf: true } },
      openedBy: { select: { id: true, name: true } },
    },
  })
}

// ─── Get ─────────────────────────────────────────────────────────────────────

export async function getComanda(comandaId: string) {
  return db.comanda.findUniqueOrThrow({
    where: { id: comandaId },
    include: {
      player: { select: { id: true, name: true, cpf: true } },
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          session: { select: { id: true } },
          tournament: { select: { id: true, name: true } },
        },
      },
      tournamentPlayers: {
        include: {
          tournament: { select: { id: true, name: true } },
        },
      },
    },
  })
}

export async function getComandaByPlayer({
  playerId,
  homeGameId,
}: {
  playerId: string
  homeGameId: string
}) {
  return db.comanda.findFirst({
    where: { playerId, homeGameId, status: 'OPEN' },
    include: {
      player: { select: { id: true, name: true, cpf: true } },
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          tournament: { select: { id: true, name: true } },
        },
      },
    },
  })
}

export async function listComandas({
  homeGameId,
  status,
}: {
  homeGameId: string
  status?: 'OPEN' | 'CLOSED'
}) {
  return db.comanda.findMany({
    where: {
      homeGameId,
      ...(status ? { status } : {}),
    },
    orderBy: { openedAt: 'desc' },
    include: {
      player: { select: { id: true, name: true } },
    },
  })
}

// ─── Add item ─────────────────────────────────────────────────────────────────

export async function addComandaItem({
  comandaId,
  type,
  amount,
  description,
  sessionId,
  tournamentId,
  tournamentPlayerId,
  transactionId,
  createdByUserId,
}: {
  comandaId: string
  type: ComandaItemType
  amount: number
  description?: string
  sessionId?: string
  tournamentId?: string
  tournamentPlayerId?: string
  transactionId?: string
  createdByUserId: string
}) {
  const comanda = await db.comanda.findUniqueOrThrow({ where: { id: comandaId } })
  if (comanda.status === 'CLOSED') throw new Error('Comanda já está fechada')

  const isDebit = isDebitType(type)
  const isPayment = isPaymentType(type)

  // Para débitos: verifica limite de crédito em modo PREPAID
  if (isDebit && comanda.mode === 'PREPAID') {
    const newBalance = Number(comanda.balance) - amount
    if (comanda.creditLimit !== null && newBalance < -Number(comanda.creditLimit)) {
      throw new Error('Limite de crédito insuficiente')
    }
  }

  const item = await prisma.$transaction(async (tx: any) => {
    const created = await tx.comandaItem.create({
      data: {
        comandaId,
        type,
        amount,
        description: description ?? null,
        sessionId: sessionId ?? null,
        tournamentId: tournamentId ?? null,
        tournamentPlayerId: tournamentPlayerId ?? null,
        transactionId: transactionId ?? null,
        paymentStatus: isPayment ? 'PENDING' : null,
        createdByUserId,
      },
    })

    // Atualiza saldo da comanda
    const delta = isPayment ? amount : isDebit ? -amount : amount
    await tx.comanda.update({
      where: { id: comandaId },
      data: { balance: { increment: delta } },
    })

    return created
  })

  return item
}

// ─── Settle payment item ──────────────────────────────────────────────────────

export async function settleComandaPaymentItem({
  itemId,
  paymentReference,
  paymentVirtualAccount,
  paymentStatus,
}: {
  itemId: string
  paymentReference?: string
  paymentVirtualAccount?: string
  paymentStatus: ComandaItemPaymentStatus
}) {
  return db.comandaItem.update({
    where: { id: itemId },
    data: {
      paymentReference: paymentReference ?? undefined,
      paymentVirtualAccount: paymentVirtualAccount ?? undefined,
      paymentStatus,
      updatedAt: new Date(),
    },
  })
}

// ─── Close ────────────────────────────────────────────────────────────────────

export async function closeComanda({
  comandaId,
  closedByUserId,
}: {
  comandaId: string
  closedByUserId: string
}) {
  const comanda = await db.comanda.findUniqueOrThrow({
    where: { id: comandaId },
    include: { items: true },
  })
  if (comanda.status === 'CLOSED') throw new Error('Comanda já está fechada')

  const hasPendingPayments = comanda.items.some(
    (i: any) => isPaymentType(i.type) && i.paymentStatus === 'PENDING',
  )
  if (hasPendingPayments) {
    throw new Error('Existem pagamentos pendentes na comanda')
  }

  return db.comanda.update({
    where: { id: comandaId },
    data: { status: 'CLOSED', closedAt: new Date(), closedByUserId },
    include: {
      player: { select: { id: true, name: true } },
    },
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDebitType(type: ComandaItemType): boolean {
  return [
    'CASH_BUYIN',
    'CASH_REBUY',
    'CASH_ADDON',
    'TOURNAMENT_BUYIN',
    'TOURNAMENT_REBUY',
    'TOURNAMENT_ADDON',
    'TRANSFER_OUT',
  ].includes(type)
}

function isPaymentType(type: ComandaItemType): boolean {
  return [
    'PAYMENT_PIX_SPOT',
    'PAYMENT_PIX_TERM',
    'PAYMENT_CASH',
    'PAYMENT_CARD',
  ].includes(type)
}
