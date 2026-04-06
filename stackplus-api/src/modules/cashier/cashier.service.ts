import { prisma } from '../../lib/prisma'
import { TransactionType } from '@prisma/client'

type CashierTransactionType = TransactionType | 'JACKPOT'

interface TransactionInput {
  sessionId: string
  userId: string
  type: CashierTransactionType
  amount: number
  chips: number
  note?: string
  registeredBy: string
}

export async function registerTransaction(input: TransactionInput) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: input.sessionId },
    include: { homeGame: true },
  })

  if (session.status !== 'ACTIVE') throw new Error('Sessão não está ativa')

  const chipValue = Number(session.chipValue ?? session.homeGame.chipValue)
  const isJackpot = input.type === 'JACKPOT'
  if (isJackpot && session.jackpotEnabled === false) {
    throw new Error('Jackpot está desabilitado para esta partida')
  }
  const chips = Number(input.chips)
  if (Number.isNaN(chips)) throw new Error('Informe uma quantidade de fichas válida')
  if (input.type === TransactionType.CASHOUT) {
    if (chips < 0) throw new Error('Cashout não pode ter quantidade negativa')
  } else if (chips <= 0) {
    throw new Error('Quantidade de fichas deve ser maior que zero')
  }

  const amount = Number((chips * chipValue).toFixed(2))

  let state = await prisma.playerSessionState.findUnique({
    where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })

  if (!state && input.type !== TransactionType.BUYIN) {
    throw new Error('Jogador deve fazer buy-in primeiro')
  }

  if (state && input.type === TransactionType.BUYIN) {
    throw new Error('Buy-in já realizado para este jogador')
  }

  if (state?.hasCashedOut) throw new Error('Jogador já realizou cashout nesta sessão')

  if (input.type === TransactionType.CASHOUT) {
    const playerCurrentStack = Number(state?.currentStack || 0)
    if (chips > playerCurrentStack) {
      throw new Error(`Cashout não pode exceder o stack atual do jogador (${playerCurrentStack.toLocaleString('pt-BR')} fichas)`)
    }
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const newTx = await tx.transaction.create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        type: input.type as TransactionType,
        amount,
        chips: isJackpot ? 0 : chips,
        note: input.note,
        registeredBy: input.registeredBy,
      },
    })

    if (!state) {
      state = await tx.playerSessionState.create({
        data: {
          sessionId: input.sessionId,
          userId: input.userId,
          chipsIn: amount,
          currentStack: chips,
        },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    } else {
      let chipsIn = Number(state.chipsIn)
      let chipsOut = Number(state.chipsOut)
      let currentStack = Number(state.currentStack)
      let hasCashedOut = state.hasCashedOut

      if (input.type === TransactionType.BUYIN || input.type === TransactionType.REBUY || input.type === TransactionType.ADDON) {
        chipsIn += amount
        currentStack += chips
      } else if (isJackpot) {
        currentStack += chips
      } else if (input.type === TransactionType.CASHOUT) {
        chipsOut += amount
        currentStack = 0
        hasCashedOut = true
      }

      const result = chipsOut - chipsIn

      state = await tx.playerSessionState.update({
        where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
        data: { chipsIn, chipsOut, currentStack, result, hasCashedOut },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    }

    return { transaction: newTx, playerState: state }
  })

  return transaction
}

export async function getTransactions(sessionId: string, userId?: string) {
  return prisma.transaction.findMany({
    where: { sessionId, ...(userId ? { userId } : {}) },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function deleteTransaction(transactionId: string) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: {
        session: {
          include: {
            homeGame: true,
          },
        },
      },
    })

    if (target.session.status !== 'ACTIVE') {
      throw new Error('Só é possível excluir transações com a sessão ativa')
    }

    await tx.transaction.delete({ where: { id: transactionId } })

    const remaining = await tx.transaction.findMany({
      where: {
        sessionId: target.sessionId,
        userId: target.userId,
      },
      orderBy: [
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    })

    if (remaining.length === 0) {
      await tx.playerSessionState.deleteMany({
        where: {
          sessionId: target.sessionId,
          userId: target.userId,
        },
      })

      return {
        deleted: true,
        sessionId: target.sessionId,
        userId: target.userId,
      }
    }

    let chipsInAmount = 0
    let chipsOutAmount = 0
    let currentStackChips = 0
    let hasCashedOut = false

    for (const transaction of remaining) {
      const amount = Number(transaction.amount)
      const chips = Number(transaction.chips)

      if (
        transaction.type === TransactionType.BUYIN ||
        transaction.type === TransactionType.REBUY ||
        transaction.type === TransactionType.ADDON
      ) {
        chipsInAmount += amount
        currentStackChips += chips
        continue
      }

      if (transaction.type === TransactionType.JACKPOT) {
        currentStackChips += chips
        continue
      }

      if (transaction.type === TransactionType.CASHOUT) {
        chipsOutAmount += amount
        currentStackChips = 0
        hasCashedOut = true
      }
    }

    await tx.playerSessionState.upsert({
      where: {
        sessionId_userId: {
          sessionId: target.sessionId,
          userId: target.userId,
        },
      },
      create: {
        sessionId: target.sessionId,
        userId: target.userId,
        chipsIn: chipsInAmount,
        chipsOut: chipsOutAmount,
        currentStack: currentStackChips,
        result: chipsOutAmount - chipsInAmount,
        hasCashedOut,
      },
      update: {
        chipsIn: chipsInAmount,
        chipsOut: chipsOutAmount,
        currentStack: currentStackChips,
        result: chipsOutAmount - chipsInAmount,
        hasCashedOut,
      },
    })

    return {
      deleted: true,
      sessionId: target.sessionId,
      userId: target.userId,
    }
  })
}
