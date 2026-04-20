import { prisma } from '../../lib/prisma'
import { SangeurMovementType, SangeurPaymentMethod, SangeurPaymentStatus, SangeurShiftStatus, SessionStatus, TransactionType } from '@prisma/client'
import { randomBytes } from 'crypto'
import * as AnnapayService from '../banking/annapay.service'
import { findOrOpenComandaWithTx, addComandaItemWithTx } from '../comanda/comanda.service'

function toNumber(value: string | number | null | undefined | any) {
  return Number(value || 0)
}

function round2(value: number) {
  return Number(value.toFixed(2))
}

function generateVoucherCode() {
  return `VL-${randomBytes(4).toString('hex').toUpperCase()}`
}

async function ensureSangeurAccess(homeGameId: string, userId: string) {
  const access = await prisma.homeGameSangeurAccess.findUnique({
    where: {
      homeGameId_userId: {
        homeGameId,
        userId,
      },
    },
    include: {
      homeGame: {
        select: {
          id: true,
          name: true,
          chipValue: true,
        },
      },
    },
  })

  if (!access || !access.isActive) throw new Error('Acesso SANGEUR não autorizado para este Home Game')
  return access
}

function buildShiftSummary(shift: any) {
  const initialChips = toNumber(shift.initialChips)
  const reloadedChips = shift.movements
    .filter((movement: any) => movement.type === 'RELOAD')
    .reduce((sum: number, movement: any) => sum + toNumber(movement.chips), 0)
  const returnedChips = shift.movements
    .filter((movement: any) => movement.type === 'RETURN')
    .reduce((sum: number, movement: any) => sum + toNumber(movement.chips), 0)

  const validSales = shift.sales.filter((sale: any) => sale.paymentStatus !== 'CANCELED')
  const soldChips = validSales.reduce((sum: number, sale: any) => sum + toNumber(sale.chips), 0)

  const totalSalesAmount = validSales.reduce((sum: number, sale: any) => sum + toNumber(sale.amount), 0)
  const paidAmount = validSales
    .filter((sale: any) => sale.paymentStatus === 'PAID')
    .reduce((sum: number, sale: any) => sum + toNumber(sale.amount), 0)
  const pendingAmount = validSales
    .filter((sale: any) => sale.paymentStatus === 'PENDING')
    .reduce((sum: number, sale: any) => sum + toNumber(sale.amount), 0)

  const pendingVoucherAmount = validSales
    .filter((sale: any) => sale.paymentStatus === 'PENDING' && sale.paymentMethod === 'VOUCHER')
    .reduce((sum: number, sale: any) => sum + toNumber(sale.amount), 0)

  const availableChips = round2(initialChips + reloadedChips - soldChips - returnedChips)

  return {
    initialChips,
    reloadedChips,
    soldChips,
    returnedChips,
    availableChips,
    totalSalesAmount: round2(totalSalesAmount),
    paidAmount: round2(paidAmount),
    pendingAmount: round2(pendingAmount),
    pendingVoucherAmount: round2(pendingVoucherAmount),
  }
}

async function getShiftByIdForSangeur(shiftId: string, userId: string) {
  const shift = await prisma.sangeurShift.findUniqueOrThrow({
    where: { id: shiftId },
    include: {
      session: {
        select: {
          id: true,
          status: true,
          chipValue: true,
          homeGame: {
            select: {
              id: true,
              name: true,
              chipValue: true,
            },
          },
        },
      },
      sangeurAccess: {
        select: {
          id: true,
          username: true,
          isActive: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      movements: {
        orderBy: { createdAt: 'desc' },
      },
      sales: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (shift.sangeurUserId !== userId) throw new Error('Acesso negado')

  return {
    ...shift,
    summary: buildShiftSummary(shift),
  }
}

export async function listOperationalSessions(homeGameId: string, userId: string) {
  await ensureSangeurAccess(homeGameId, userId)

  const [sessions, openShifts] = await Promise.all([
    prisma.session.findMany({
      where: {
        homeGameId,
        status: { in: [SessionStatus.WAITING, SessionStatus.ACTIVE] },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        startedAt: true,
        chipValue: true,
        financialModule: true,
        homeGame: {
          select: { financialModule: true },
        },
        _count: {
          select: {
            playerStates: true,
            transactions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.sangeurShift.findMany({
      where: {
        homeGameId,
        sangeurUserId: userId,
        status: SangeurShiftStatus.OPEN,
      },
      select: {
        id: true,
        sessionId: true,
        openedAt: true,
      },
    }),
  ])

  const openShiftMap = new Map(openShifts.map((shift) => [shift.sessionId, shift]))

  return sessions.map((session) => {
    const shift = openShiftMap.get(session.id)
    const financialModule = session.financialModule || session.homeGame?.financialModule || 'POSTPAID'
    return {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
      startedAt: session.startedAt,
      chipValue: toNumber(session.chipValue),
      financialModule,
      _count: session._count,
      openShiftId: shift?.id || null,
      openShiftOpenedAt: shift?.openedAt || null,
    }
  })
}

export async function listSessionParticipants(input: {
  sessionId: string
  userId: string
}) {
  const shift = await prisma.sangeurShift.findFirst({
    where: {
      sessionId: input.sessionId,
      sangeurUserId: input.userId,
    },
    select: { id: true, homeGameId: true },
  })

  if (!shift) throw new Error('Turno SANGEUR inexistente para esta sessão')

  await ensureSangeurAccess(shift.homeGameId, input.userId)

  const [playerStates, members, participants] = await Promise.all([
    prisma.playerSessionState.findMany({
      where: { sessionId: input.sessionId },
      select: {
        userId: true,
        chipsIn: true,
        chipsOut: true,
        currentStack: true,
        result: true,
        hasCashedOut: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.homeGameMember.findMany({
      where: { homeGameId: shift.homeGameId },
      select: {
        userId: true,
        paymentMode: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.sessionParticipant.findMany({
      where: { sessionId: input.sessionId },
      select: {
        userId: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
  ])

  const participantIds = new Set(participants.map((p) => p.userId))
  const playerStateIds = new Set(playerStates.map((ps) => ps.userId))

  // Selected participants drive the "registered in session" list — mirrors cashier logic.
  const registeredUsers = new Map<string, { id: string; name: string; avatarUrl?: string | null; paymentMode: 'POSTPAID' | 'PREPAID' | null }>()

  for (const member of members) {
    if (participantIds.size > 0 && !participantIds.has(member.userId) && !playerStateIds.has(member.userId)) continue
    registeredUsers.set(member.userId, {
      id: member.user.id,
      name: member.user.name,
      avatarUrl: member.user.avatarUrl || null,
      paymentMode: member.paymentMode || null,
    })
  }

  for (const participant of participants) {
    if (registeredUsers.has(participant.userId)) continue
    registeredUsers.set(participant.userId, {
      id: participant.user.id,
      name: participant.user.name,
      avatarUrl: participant.user.avatarUrl || null,
      paymentMode: null,
    })
  }

  for (const state of playerStates) {
    if (registeredUsers.has(state.userId)) continue
    registeredUsers.set(state.userId, {
      id: state.user.id,
      name: state.user.name,
      avatarUrl: state.user.avatarUrl || null,
      paymentMode: null,
    })
  }

  const playerStateMap = new Map(playerStates.map((ps) => [ps.userId, ps]))

  const players = Array.from(registeredUsers.values()).map((user) => {
    const state = playerStateMap.get(user.id)
    return {
      userId: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      paymentMode: user.paymentMode,
      chipsIn: state ? toNumber(state.chipsIn) : 0,
      chipsOut: state ? toNumber(state.chipsOut) : 0,
      currentStack: state ? toNumber(state.currentStack) : 0,
      result: state ? toNumber(state.result) : 0,
      hasCashedOut: Boolean(state?.hasCashedOut),
      inSession: Boolean(state),
    }
  })

  // "candidates" = members do home game que a sangeur pode adicionar ad-hoc
  const candidates = members
    .filter((member) => !registeredUsers.has(member.userId))
    .map((member) => ({
      userId: member.user.id,
      name: member.user.name,
      avatarUrl: member.user.avatarUrl || null,
      paymentMode: member.paymentMode || null,
    }))

  return { players, candidates }
}

export async function openShift(input: {
  homeGameId: string
  sessionId: string
  userId: string
  initialChips: number
  note?: string
}) {
  const access = await ensureSangeurAccess(input.homeGameId, input.userId)

  const session = await prisma.session.findFirst({
    where: {
      id: input.sessionId,
      homeGameId: input.homeGameId,
      status: { in: [SessionStatus.WAITING, SessionStatus.ACTIVE] },
    },
    select: { id: true },
  })

  if (!session) throw new Error('Sessão inválida para abertura de turno SANGEUR')

  const existingOpenShift = await prisma.sangeurShift.findFirst({
    where: {
      sessionId: input.sessionId,
      sangeurUserId: input.userId,
      status: SangeurShiftStatus.OPEN,
    },
    select: { id: true },
  })

  if (existingOpenShift) {
    return getShiftByIdForSangeur(existingOpenShift.id, input.userId)
  }

  const initialChips = round2(input.initialChips)
  if (initialChips < 0) throw new Error('Quantidade inicial de fichas inválida')

  const shift = await prisma.$transaction(async (tx) => {
    const created = await tx.sangeurShift.create({
      data: {
        homeGameId: input.homeGameId,
        sessionId: input.sessionId,
        sangeurAccessId: access.id,
        sangeurUserId: input.userId,
        initialChips,
        note: input.note?.trim() || null,
      },
      select: { id: true },
    })

    if (initialChips > 0) {
      await tx.sangeurShiftMovement.create({
        data: {
          shiftId: created.id,
          type: SangeurMovementType.INITIAL_LOAD,
          chips: initialChips,
          note: 'Carga inicial de fichas do caixa',
          createdByUserId: input.userId,
        },
      })
    }

    return created
  })

  return getShiftByIdForSangeur(shift.id, input.userId)
}

export async function getShift(shiftId: string, userId: string) {
  return getShiftByIdForSangeur(shiftId, userId)
}

export async function addReload(input: {
  shiftId: string
  userId: string
  chips: number
  note?: string
}) {
  const shift = await getShiftByIdForSangeur(input.shiftId, input.userId)
  if (shift.status !== SangeurShiftStatus.OPEN) throw new Error('Turno SANGEUR já encerrado')

  const chips = round2(input.chips)
  if (chips <= 0) throw new Error('Informe uma quantidade de fichas maior que zero')

  await prisma.sangeurShiftMovement.create({
    data: {
      shiftId: input.shiftId,
      type: SangeurMovementType.RELOAD,
      chips,
      note: input.note?.trim() || 'Reforço de fichas do caixa',
      createdByUserId: input.userId,
    },
  })

  return getShiftByIdForSangeur(input.shiftId, input.userId)
}

export async function registerSale(input: {
  shiftId: string
  userId: string
  chips: number
  paymentMethod: SangeurPaymentMethod
  sessionUserId?: string | null
  playerName?: string
  note?: string
  paymentReference?: string
}) {
  const shift = await getShiftByIdForSangeur(input.shiftId, input.userId)
  if (shift.status !== SangeurShiftStatus.OPEN) throw new Error('Turno SANGEUR já encerrado')
  if (shift.session.status !== SessionStatus.ACTIVE) {
    throw new Error('A sessão precisa estar ATIVA para registrar vendas SANGEUR')
  }

  const chips = round2(input.chips)
  if (chips <= 0) throw new Error('Informe uma quantidade de fichas maior que zero')

  const available = shift.summary.availableChips
  if (chips > available) {
    throw new Error('Saldo de fichas insuficiente para a venda')
  }

  const sessionUserId = input.sessionUserId?.trim() || null
  if (!sessionUserId) throw new Error('Selecione o jogador para vincular a venda à sessão')

  // Verifica se o jogador é membro do home game (protege contra IDs aleatórios)
  const member = await prisma.homeGameMember.findFirst({
    where: { homeGameId: shift.homeGameId, userId: sessionUserId },
    select: { userId: true, user: { select: { id: true, name: true, cpf: true } } },
  })
  const participant = member
    ? null
    : await prisma.sessionParticipant.findFirst({
        where: { sessionId: shift.sessionId, userId: sessionUserId },
        select: { userId: true, user: { select: { id: true, name: true, cpf: true } } },
      })
  const existingState = member || participant
    ? null
    : await prisma.playerSessionState.findUnique({
        where: { sessionId_userId: { sessionId: shift.sessionId, userId: sessionUserId } },
        select: { userId: true, user: { select: { id: true, name: true, cpf: true } } },
      })
  const playerLookup = member || participant || existingState
  if (!playerLookup) throw new Error('Jogador não pertence a este home game')

  const resolvedPlayerName = input.playerName?.trim() || playerLookup.user?.name || null

  const chipValue = toNumber(shift.session.chipValue || shift.session.homeGame.chipValue)
  const amount = round2(chips * chipValue)

  let paymentStatus = input.paymentMethod === SangeurPaymentMethod.VOUCHER
    ? SangeurPaymentStatus.PENDING
    : SangeurPaymentStatus.PAID

  let paymentReference = input.paymentReference?.trim() || null
  let pixQrData: any = null

  // PIX_QR: criar cobrança Annapay antes de persistir qualquer coisa
  if (input.paymentMethod === SangeurPaymentMethod.PIX_QR) {
    try {
      paymentStatus = SangeurPaymentStatus.PENDING
      const playerCpf = (playerLookup.user as any)?.cpf
        ? String((playerLookup.user as any).cpf).replace(/\D/g, '')
        : null
      const playerDisplayName = resolvedPlayerName || playerLookup.user?.name || 'Jogador'
      const cobResult = await AnnapayService.createNormalizedCob({
        calendario: { expiracao: 3600 },
        devedor: {
          nome: playerDisplayName,
          ...(playerCpf ? { cpf: playerCpf } : {}),
        },
        valor: { original: amount.toFixed(2) },
        solicitacaoPagador: `Venda SANGEUR - ${shift.session.homeGame.name} - ${chips} fichas`,
      })

      pixQrData = cobResult
      if (typeof cobResult === 'object' && cobResult !== null) {
        const normalized = cobResult as Record<string, any>
        const chargeId = normalized.id || normalized.identificador
        if (chargeId) paymentReference = chargeId
      }
    } catch (error) {
      console.warn('[sangeur.registerSale] Failed to create PIX charge:', error)
      throw new Error('Falha ao criar cobrança PIX. Tente novamente.')
    }
  }

  // Prepara metadados da integração com comanda (aplicada dentro da mesma transaction abaixo)
  const comandaGameLabel = shift.session.homeGame?.name ?? shift.homeGameId
  const paymentTypeMap: Partial<Record<SangeurPaymentMethod, string>> = {
    [SangeurPaymentMethod.CASH]:    'PAYMENT_CASH',
    [SangeurPaymentMethod.CARD]:    'PAYMENT_CARD',
    [SangeurPaymentMethod.PIX_QR]:  'PAYMENT_PIX_SPOT',
    // VOUCHER: sem item de pagamento imediato (fica pendente)
  }
  const comandaPaymentType = paymentTypeMap[input.paymentMethod] ?? null

  // Transação atômica: cria Transaction (BUYIN/REBUY) + SangeurSale + atualiza PlayerSessionState + aplica na comanda.
  // As fichas já são entregues ao jogador agora, por isso a Transaction é criada mesmo para VOUCHER/PIX pendente.
  // BLOCKING: se a aplicação na comanda falhar (ex.: limite estourado), a venda inteira é revertida.
  const { sale, transaction, playerState } = await prisma.$transaction(async (tx) => {
    const currentState = await tx.playerSessionState.findUnique({
      where: { sessionId_userId: { sessionId: shift.sessionId, userId: sessionUserId } },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    })

    if (currentState?.hasCashedOut) {
      throw new Error('Jogador já realizou cashout nesta sessão')
    }

    // Garante que o jogador esteja formalmente vinculado à sessão (SessionParticipant).
    // Sem isso, jogadores inseridos ad-hoc pela sangeur não aparecem no seletor do caixa
    // nem em outros fluxos que filtram por participantes.
    await tx.sessionParticipant.upsert({
      where: { sessionId_userId: { sessionId: shift.sessionId, userId: sessionUserId } },
      update: {},
      create: { sessionId: shift.sessionId, userId: sessionUserId },
    })

    const txType = currentState ? TransactionType.REBUY : TransactionType.BUYIN
    const newTx = await tx.transaction.create({
      data: {
        sessionId: shift.sessionId,
        userId: sessionUserId,
        type: txType,
        amount,
        chips,
        note: input.note?.trim() || `Venda SANGEUR [shift:${shift.id}]`,
        // DATA-001: grava userId puro + marca origin='S'. Legacy rows
        // com prefixo "sangeur:" em registeredBy são resolvidos por backfill.
        registeredBy: input.userId,
        origin: 'S',
      },
    })

    let nextState
    if (!currentState) {
      nextState = await tx.playerSessionState.create({
        data: {
          sessionId: shift.sessionId,
          userId: sessionUserId,
          chipsIn: amount,
          currentStack: chips,
        },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    } else {
      const chipsIn = Number(currentState.chipsIn) + amount
      const chipsOut = Number(currentState.chipsOut)
      const currentStack = Number(currentState.currentStack) + chips
      const result = chipsOut - chipsIn
      nextState = await tx.playerSessionState.update({
        where: { sessionId_userId: { sessionId: shift.sessionId, userId: sessionUserId } },
        data: { chipsIn, chipsOut, currentStack, result },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    }

    const newSale = await tx.sangeurSale.create({
      data: {
        shiftId: shift.id,
        sessionUserId,
        transactionId: newTx.id,
        chips,
        chipValue,
        amount,
        paymentMethod: input.paymentMethod,
        paymentStatus,
        paymentReference,
        voucherCode: input.paymentMethod === SangeurPaymentMethod.VOUCHER ? generateVoucherCode() : null,
        playerName: resolvedPlayerName,
        note: input.note?.trim() || null,
        settledAt: paymentStatus === SangeurPaymentStatus.PAID ? new Date() : null,
        createdByUserId: input.userId,
      },
      include: {
        sessionUser: { select: { id: true, name: true, avatarUrl: true } },
        shift: {
          select: {
            id: true,
            sessionId: true,
            sangeurUserId: true,
            sangeurAccess: { select: { username: true, user: { select: { id: true, name: true } } } },
          },
        },
      },
    })

    // Comanda integration — BLOCKING: roda dentro da mesma tx.
    // Se falhar (ex.: limite de crédito insuficiente), a venda inteira é revertida.
    const cashType = newTx.type === TransactionType.BUYIN ? 'CASH_BUYIN' : 'CASH_REBUY'
    const typeLabel = newTx.type === TransactionType.BUYIN ? 'Buy-in' : 'Rebuy'
    const txDescription = `${typeLabel} (Sangeur) — ${comandaGameLabel}`

    const comanda = await findOrOpenComandaWithTx(tx, {
      playerId: sessionUserId,
      homeGameId: shift.homeGameId,
      openedByUserId: input.userId,
    })

    await addComandaItemWithTx(tx, {
      comandaId: comanda.id,
      type: cashType as any,
      amount,
      description: txDescription,
      sessionId: shift.sessionId,
      transactionId: newSale.transactionId ?? undefined,
      createdByUserId: input.userId,
    })

    if (comandaPaymentType) {
      const isPix = input.paymentMethod === SangeurPaymentMethod.PIX_QR
      await addComandaItemWithTx(tx, {
        comandaId: comanda.id,
        type: comandaPaymentType as any,
        amount,
        description: `Pagamento ${isPix ? 'PIX' : input.paymentMethod} — ${txDescription}`,
        sessionId: shift.sessionId,
        transactionId: newSale.transactionId ?? undefined,
        createdByUserId: input.userId,
      })
    }

    return { sale: newSale, transaction: newTx, playerState: nextState }
  }, { timeout: 15000, maxWait: 10000 })

  const updatedShift = await getShiftByIdForSangeur(input.shiftId, input.userId)

  return {
    shift: updatedShift,
    sale,
    transaction,
    playerState,
    pixQrData: input.paymentMethod === SangeurPaymentMethod.PIX_QR ? pixQrData : null,
  }
}

export async function listSessionSales(sessionId: string) {
  const sales = await prisma.sangeurSale.findMany({
    where: { shift: { sessionId } },
    orderBy: { createdAt: 'desc' },
    include: {
      sessionUser: { select: { id: true, name: true, avatarUrl: true } },
      shift: {
        select: {
          id: true,
          sangeurUserId: true,
          sangeurAccess: { select: { username: true, user: { select: { id: true, name: true } } } },
        },
      },
    },
  })
  return sales
}

export async function settleVoucherSale(input: {
  saleId: string
  userId: string
  paymentReference?: string
}) {
  const sale = await prisma.sangeurSale.findUniqueOrThrow({
    where: { id: input.saleId },
    include: {
      shift: {
        select: {
          id: true,
          sangeurUserId: true,
        },
      },
    },
  })

  if (sale.shift.sangeurUserId !== input.userId) throw new Error('Acesso negado')
  if (sale.paymentMethod !== SangeurPaymentMethod.VOUCHER) throw new Error('Somente vendas por VALE podem ser liquidadas aqui')
  if (sale.paymentStatus === SangeurPaymentStatus.PAID) return sale

  return prisma.sangeurSale.update({
    where: { id: input.saleId },
    data: {
      paymentStatus: SangeurPaymentStatus.PAID,
      paymentReference: input.paymentReference?.trim() || sale.paymentReference,
      settledAt: new Date(),
    },
  })
}

export async function getVoucherReceiptData(input: {
  saleId: string
  userId: string
}) {
  const sale = await prisma.sangeurSale.findUniqueOrThrow({
    where: { id: input.saleId },
    include: {
      sessionUser: { select: { id: true, name: true, cpf: true } },
      shift: {
        select: {
          id: true,
          sangeurUserId: true,
          session: {
            select: {
              id: true,
              createdAt: true,
              homeGame: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          sangeurAccess: {
            select: {
              username: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (sale.shift.sangeurUserId !== input.userId) throw new Error('Acesso negado')
  if (sale.paymentMethod !== SangeurPaymentMethod.VOUCHER) throw new Error('Somente vendas por VALE possuem felipeta')

  // Todas as transações de compra de fichas (BUYIN/REBUY/ADDON) do jogador nesta sessão,
  // com origem (caixa ou sangeur), excluindo as já quitadas (sangeur com status PAID).
  const playerUserId = sale.sessionUserId || sale.shift.session.id === sale.shift.session.id ? sale.sessionUserId : null
  const allTxs = playerUserId
    ? await prisma.transaction.findMany({
        where: {
          sessionId: sale.shift.session.id,
          userId: playerUserId,
          type: { in: [TransactionType.BUYIN, TransactionType.REBUY, TransactionType.ADDON] },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          amount: true,
          chips: true,
          createdAt: true,
          registeredBy: true,
          origin: true,
          sangeurSale: { select: { paymentStatus: true } },
        },
      })
    : []

  const unpaid = allTxs
    .filter((tx) => {
      // Se houver sangeur sale vinculado e já estiver paga/cancelada, não é débito pendente.
      if (tx.sangeurSale) {
        return tx.sangeurSale.paymentStatus === SangeurPaymentStatus.PENDING
      }
      // Transações direto do caixa: consideradas em aberto (crédito ao jogador em pós-pago).
      return true
    })
    .map((tx) => {
      // DATA-001: fonte preferida é a coluna origin. Fallback pro prefixo
      // legacy cobre rows cujo backfill não rodou (rollback parcial).
      const origin: 'C' | 'S' =
        tx.origin === 'C' || tx.origin === 'S'
          ? tx.origin
          : typeof tx.registeredBy === 'string' && tx.registeredBy.startsWith('sangeur:')
            ? 'S'
            : 'C'
      return {
        id: tx.id,
        origin,
        type: tx.type,
        chips: toNumber(tx.chips),
        amount: toNumber(tx.amount),
        createdAt: tx.createdAt,
      }
    })

  return {
    saleId: sale.id,
    voucherCode: sale.voucherCode,
    playerName: sale.sessionUser?.name || sale.playerName,
    playerCpf: sale.sessionUser?.cpf || null,
    chips: toNumber(sale.chips),
    chipValue: toNumber(sale.chipValue),
    amount: toNumber(sale.amount),
    paymentStatus: sale.paymentStatus,
    paymentReference: sale.paymentReference,
    createdAt: sale.createdAt,
    settledAt: sale.settledAt,
    note: sale.note,
    homeGame: {
      id: sale.shift.session.homeGame.id,
      name: sale.shift.session.homeGame.name,
    },
    session: {
      id: sale.shift.session.id,
      createdAt: sale.shift.session.createdAt,
    },
    operator: {
      username: sale.shift.sangeurAccess.username,
      name: sale.shift.sangeurAccess.user.name,
    },
    playerUnpaidEntries: unpaid,
    playerUnpaidTotal: unpaid.reduce((acc, v) => acc + v.amount, 0),
  }
}

export async function getShiftClosingReport(input: {
  shiftId: string
  userId: string
}) {
  const shift = await getShiftByIdForSangeur(input.shiftId, input.userId)

  if (shift.status !== SangeurShiftStatus.CLOSED) {
    throw new Error('O relatório completo só fica disponível após o encerramento do turno')
  }

  const methods = [
    SangeurPaymentMethod.PIX_QR,
    SangeurPaymentMethod.VOUCHER,
    SangeurPaymentMethod.CASH,
    SangeurPaymentMethod.CARD,
  ] as const

  const paymentBreakdown = methods.map((method) => {
    const methodSales = shift.sales.filter((sale: any) => sale.paymentMethod === method)
    const paidSales = methodSales.filter((sale: any) => sale.paymentStatus === SangeurPaymentStatus.PAID)
    const pendingSales = methodSales.filter((sale: any) => sale.paymentStatus === SangeurPaymentStatus.PENDING)
    const canceledSales = methodSales.filter((sale: any) => sale.paymentStatus === SangeurPaymentStatus.CANCELED)

    return {
      paymentMethod: method,
      salesCount: methodSales.length,
      chipsTotal: round2(methodSales.reduce((sum: number, sale: any) => sum + toNumber(sale.chips), 0)),
      amountTotal: round2(methodSales.reduce((sum: number, sale: any) => sum + toNumber(sale.amount), 0)),
      amountPaid: round2(paidSales.reduce((sum: number, sale: any) => sum + toNumber(sale.amount), 0)),
      amountPending: round2(pendingSales.reduce((sum: number, sale: any) => sum + toNumber(sale.amount), 0)),
      amountCanceled: round2(canceledSales.reduce((sum: number, sale: any) => sum + toNumber(sale.amount), 0)),
    }
  })

  const pendingSales = shift.sales
    .filter((sale: any) => sale.paymentStatus === SangeurPaymentStatus.PENDING)
    .map((sale: any) => ({
      saleId: sale.id,
      paymentMethod: sale.paymentMethod,
      voucherCode: sale.voucherCode,
      playerName: sale.playerName,
      amount: round2(toNumber(sale.amount)),
      chips: round2(toNumber(sale.chips)),
      paymentReference: sale.paymentReference,
      createdAt: sale.createdAt,
    }))

  return {
    shift: {
      id: shift.id,
      status: shift.status,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      note: shift.note,
    },
    homeGame: {
      id: shift.session.homeGame.id,
      name: shift.session.homeGame.name,
    },
    session: {
      id: shift.session.id,
      status: shift.session.status,
      chipValue: round2(toNumber(shift.session.chipValue || shift.session.homeGame.chipValue)),
    },
    operator: {
      id: shift.sangeurAccess.user.id,
      username: shift.sangeurAccess.username,
      name: shift.sangeurAccess.user.name,
    },
    inventory: {
      initialChips: shift.summary.initialChips,
      reloadedChips: shift.summary.reloadedChips,
      soldChips: shift.summary.soldChips,
      returnedChips: shift.summary.returnedChips,
      closingBalanceChips: shift.summary.availableChips,
      totalLoadedChips: round2(shift.summary.initialChips + shift.summary.reloadedChips),
    },
    finance: {
      totalSalesAmount: shift.summary.totalSalesAmount,
      paidAmount: shift.summary.paidAmount,
      pendingAmount: shift.summary.pendingAmount,
      pendingVoucherAmount: shift.summary.pendingVoucherAmount,
      salesCount: shift.sales.length,
      salesPaidCount: shift.sales.filter((sale: any) => sale.paymentStatus === SangeurPaymentStatus.PAID).length,
      salesPendingCount: shift.sales.filter((sale: any) => sale.paymentStatus === SangeurPaymentStatus.PENDING).length,
      salesCanceledCount: shift.sales.filter((sale: any) => sale.paymentStatus === SangeurPaymentStatus.CANCELED).length,
    },
    paymentBreakdown,
    pendingSales,
  }
}

export async function closeShift(input: {
  shiftId: string
  userId: string
  returnedChips: number
  note?: string
}) {
  const shift = await getShiftByIdForSangeur(input.shiftId, input.userId)
  if (shift.status !== SangeurShiftStatus.OPEN) throw new Error('Turno SANGEUR já encerrado')

  const returnedChips = round2(input.returnedChips)
  if (returnedChips < 0) throw new Error('Quantidade devolvida inválida')

  if (returnedChips > shift.summary.availableChips) {
    throw new Error('Não é possível devolver mais fichas do que o saldo disponível')
  }

  await prisma.$transaction(async (tx) => {
    if (returnedChips > 0) {
      await tx.sangeurShiftMovement.create({
        data: {
          shiftId: input.shiftId,
          type: SangeurMovementType.RETURN,
          chips: returnedChips,
          note: 'Devolução de fichas ao caixa',
          createdByUserId: input.userId,
        },
      })
    }

    await tx.sangeurShift.update({
      where: { id: input.shiftId },
      data: {
        status: SangeurShiftStatus.CLOSED,
        closedAt: new Date(),
        note: input.note?.trim() || shift.note,
      },
    })
  })

  return getShiftByIdForSangeur(input.shiftId, input.userId)
}

export async function settleSangeurPixSaleFromWebhook(payload: unknown) {
  // Extract charge ID from PIX webhook payload
  const normalizedPayload = payload as Record<string, any>
  const chargeId = normalizedPayload.id || normalizedPayload.identificador
  
  if (!chargeId) {
    return { processed: false, reason: 'missing-charge-id' as const }
  }

  // Find the pending SANGEUR sale with this PIX charge
  const sale = await prisma.sangeurSale.findFirst({
    where: {
      paymentMethod: SangeurPaymentMethod.PIX_QR,
      paymentReference: chargeId,
      paymentStatus: SangeurPaymentStatus.PENDING,
    },
    include: {
      shift: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  })

  if (!sale) {
    return { processed: false, reason: 'sale-not-found' as const, chargeId }
  }

  // Check if payment is confirmed
  const status = extractPaymentStatus(normalizedPayload)
  const isPaid = status === 'CONCLUIDO' || status === 'RECEIVED'
  
  if (!isPaid) {
    return { processed: false, reason: 'not-paid' as const, chargeId, status }
  }

  // Mark sale as paid
  const updatedSale = await prisma.sangeurSale.update({
    where: { id: sale.id },
    data: {
      paymentStatus: SangeurPaymentStatus.PAID,
      settledAt: new Date(),
    },
  })

  return {
    processed: true,
    reason: 'settled' as const,
    chargeId,
    saleId: sale.id,
    amount: updatedSale.amount,
  }
}

function extractPaymentStatus(payload: unknown): string | null {
  const data = payload as Record<string, any>
  
  // Try direct status fields
  if (typeof data.status === 'string') return data.status
  if (typeof data.Status === 'string') return data.Status
  
  // Try nested paths
  if (data.valor?.status) return String(data.valor.status)
  
  // Try pix confirmation
  if (data.pix && Array.isArray(data.pix) && data.pix.length > 0) {
    return 'RECEIVED'
  }
  
  return null
}

export async function getSangeurPixChargeDetails(chargeId: string) {
  try {
    return await AnnapayService.getCobById(chargeId)
  } catch (error) {
    console.error('[sangeur] Failed to fetch charge details:', error)
    throw new Error('Falha ao buscar detalhes da cobrança PIX')
  }
}
