import { prisma } from '../../lib/prisma'
import { TransactionType } from '@prisma/client'

interface TransactionInput {
  sessionId: string
  userId: string
  type: TransactionType
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

  let state = await prisma.playerSessionState.findUnique({
    where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
  })

  if (!state && input.type !== TransactionType.BUYIN) {
    throw new Error('Jogador deve fazer buy-in primeiro')
  }

  if (state?.hasCashedOut) throw new Error('Jogador já realizou cashout nesta sessão')

  if (input.type === TransactionType.CASHOUT && state && input.chips > Number(state.currentStack)) {
    throw new Error('Chips de cashout maior que o stack atual')
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const newTx = await tx.transaction.create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        type: input.type,
        amount: input.amount,
        chips: input.chips,
        note: input.note,
        registeredBy: input.registeredBy,
      },
    })

    const chipValue = Number(session.homeGame.chipValue)

    if (!state) {
      state = await tx.playerSessionState.create({
        data: {
          sessionId: input.sessionId,
          userId: input.userId,
          chipsIn: input.amount,
          currentStack: input.chips,
        },
      })
    } else {
      let chipsIn = Number(state.chipsIn)
      let chipsOut = Number(state.chipsOut)
      let currentStack = Number(state.currentStack)
      let hasCashedOut = state.hasCashedOut

      if (input.type === TransactionType.BUYIN || input.type === TransactionType.REBUY || input.type === TransactionType.ADDON) {
        chipsIn += input.amount
        currentStack += input.chips
      } else if (input.type === TransactionType.CASHOUT) {
        chipsOut += input.chips * chipValue
        currentStack = 0
        hasCashedOut = true
      }

      const result = chipsOut - chipsIn

      state = await tx.playerSessionState.update({
        where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
        data: { chipsIn, chipsOut, currentStack, result, hasCashedOut },
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
