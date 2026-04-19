import { prisma } from '../../lib/prisma'
import { createNormalizedCob, checkPixChargeIsPaid, createPix } from '../banking/annapay.service'

// Types defined locally until `npx prisma generate` is run with the new schema
type ComandaMode = 'PREPAID' | 'POSTPAID'
type ComandaItemType =
  | 'CASH_BUYIN' | 'CASH_REBUY' | 'CASH_ADDON' | 'CASH_CASHOUT'
  | 'TOURNAMENT_BUYIN' | 'TOURNAMENT_REBUY' | 'TOURNAMENT_ADDON'
  | 'TOURNAMENT_BOUNTY_RECEIVED' | 'TOURNAMENT_PRIZE'
  | 'PAYMENT_PIX_SPOT' | 'PAYMENT_PIX_TERM' | 'PAYMENT_CASH' | 'PAYMENT_CARD'
  | 'TRANSFER_IN' | 'TRANSFER_OUT'
  | 'CARRY_IN' | 'CARRY_OUT'
  | 'STAFF_CAIXINHA' | 'STAFF_RAKEBACK'
type ComandaItemPaymentStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

// ─── Mode resolution ─────────────────────────────────────────────────────────
// Resolve o modo default da comanda pra um (player, homeGame), levando em conta:
//   1. HomeGame.financialModule
//   2. HomeGameMember.paymentMode (só consultado se HomeGame for HYBRID)
//   3. Fallback POSTPAID se HYBRID + jogador sem preferência.
async function resolveDefaultComandaMode(
  playerId: string,
  homeGameId: string,
): Promise<ComandaMode> {
  const homeGame = await db.homeGame.findUniqueOrThrow({
    where: { id: homeGameId },
    select: { financialModule: true },
  })

  if (homeGame.financialModule === 'PREPAID') return 'PREPAID'
  if (homeGame.financialModule === 'POSTPAID') return 'POSTPAID'

  // HYBRID → usa preferência por membro, fallback POSTPAID
  const member = await db.homeGameMember.findUnique({
    where: { homeGameId_userId: { homeGameId, userId: playerId } },
    select: { paymentMode: true },
  })
  return (member?.paymentMode as ComandaMode | null) ?? 'POSTPAID'
}

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

  // Verifica se há saldo a transferir da comanda fechada mais recente
  const lastClosed = await db.comanda.findFirst({
    where: { playerId, homeGameId, status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
  })
  const carryBalance = lastClosed ? Number(lastClosed.balance) : 0

  // Se mode não foi passado explicitamente, herda do home game (+ preferência do jogador em HYBRID)
  const resolvedMode = mode ?? (await resolveDefaultComandaMode(playerId, homeGameId))

  return prisma.$transaction(async (tx: any) => {
    // Cria a nova comanda
    const newComanda = await tx.comanda.create({
      data: {
        playerId,
        homeGameId,
        mode: resolvedMode,
        creditLimit: creditLimit ?? null,
        note: note ?? null,
        openedByUserId,
        // já abre com o saldo transportado
        balance: carryBalance,
      },
      include: {
        player: { select: { id: true, name: true, cpf: true } },
        openedBy: { select: { id: true, name: true } },
      },
    })

    // Se há saldo a transportar, cria o item de abertura
    // OBS: CARRY_IN/CARRY_OUT são criados via tx.comandaItem.create DIRETO
    // (sem addComandaItem) porque o balance já foi definido no create da comanda
    // acima. O item serve de histórico; o delta NÃO deve ser aplicado de novo.
    if (carryBalance !== 0) {
      const isCredit = carryBalance > 0
      await tx.comandaItem.create({
        data: {
          comandaId: newComanda.id,
          type: isCredit ? 'CARRY_IN' : 'CARRY_OUT',
          amount: Math.abs(carryBalance),
          description: 'Saldo transportado da comanda anterior',
          createdByUserId: openedByUserId,
        },
      })
    }

    return newComanda
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

type AddComandaItemParams = {
  comandaId: string
  type: ComandaItemType
  amount: number
  description?: string
  sessionId?: string
  tournamentId?: string
  tournamentPlayerId?: string
  transactionId?: string
  createdByUserId: string
}

// Versão "inner" que opera em uma tx já aberta. Use quando quiser atomizar
// a criação do item da comanda junto com outra operação (ex.: caixa/sangeur).
export async function addComandaItemWithTx(tx: any, params: AddComandaItemParams) {
  const { comandaId, type, amount, description, sessionId, tournamentId, tournamentPlayerId, transactionId, createdByUserId } = params

  const comanda = await tx.comanda.findUniqueOrThrow({ where: { id: comandaId } })
  if (comanda.status === 'CLOSED') throw new Error('Comanda já está fechada')

  // CARRY_IN/CARRY_OUT só são criados na abertura da comanda, via create direto.
  // Se chegou aqui é bug: estaria aplicando delta em cima de um balance já transportado.
  if (type === 'CARRY_IN' || type === 'CARRY_OUT') {
    throw new Error('CARRY_IN/CARRY_OUT só podem ser criados na abertura da comanda')
  }

  const isDebit = isDebitType(type)
  const isPayment = isPaymentType(type)

  // Para débitos: verifica limite de crédito (vale pros dois modos).
  // creditLimit null = sem limite (comportamento default em POSTPAID).
  // creditLimit 0 = não pode ficar devendo nada (equivale ao PREPAID estrito).
  if (isDebit && comanda.creditLimit !== null) {
    const newBalance = Number(comanda.balance) - amount
    if (newBalance < -Number(comanda.creditLimit)) {
      throw new Error('Limite de crédito insuficiente')
    }
  }

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
      paymentStatus: isPayment
        ? (['PAYMENT_CASH', 'PAYMENT_CARD'].includes(type) ? 'PAID' : 'PENDING')
        : null,
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
}

// Versão pública: envelopa em transaction própria.
export async function addComandaItem(params: AddComandaItemParams) {
  return prisma.$transaction((tx: any) => addComandaItemWithTx(tx, params))
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
  // Ajusta balance conforme a transição de paymentStatus.
  // Regra: enquanto o item foi criado via addComandaItem, o balance já foi
  // incrementado no momento da criação (independente do status ser PENDING ou PAID).
  // Se o pagamento "sair" do crédito (EXPIRED/CANCELED), precisamos reverter.
  // Se um pagamento CANCELED/EXPIRED voltar a PAID (ex.: reativação manual),
  // precisamos re-creditar.
  return prisma.$transaction(async (tx: any) => {
    const item = await tx.comandaItem.findUniqueOrThrow({ where: { id: itemId } })
    if (!isPaymentType(item.type as ComandaItemType)) {
      throw new Error('Item não é de pagamento')
    }

    const prevStatus = item.paymentStatus as ComandaItemPaymentStatus | null
    const amount = Number(item.amount)

    const wasCrediting = prevStatus === null || prevStatus === 'PENDING' || prevStatus === 'PAID'
    const willBeCrediting = paymentStatus === 'PENDING' || paymentStatus === 'PAID'

    let delta = 0
    if (wasCrediting && !willBeCrediting) {
      // Saiu do crédito (ex.: PENDING → EXPIRED, PAID → CANCELED) — estorna
      delta = -amount
    } else if (!wasCrediting && willBeCrediting) {
      // Voltou pro crédito (ex.: CANCELED → PAID) — re-credita
      delta = amount
    }

    const updated = await tx.comandaItem.update({
      where: { id: itemId },
      data: {
        paymentReference: paymentReference ?? undefined,
        paymentVirtualAccount: paymentVirtualAccount ?? undefined,
        paymentStatus,
        updatedAt: new Date(),
      },
    })

    if (delta !== 0) {
      await tx.comanda.update({
        where: { id: item.comandaId },
        data: { balance: { increment: delta } },
      })
    }

    return updated
  })
}

// ─── Gerar PIX ───────────────────────────────────────────────────────────────
/**
 * Gera uma cobrança PIX via Annapay e cria o item correspondente na comanda.
 * type 'SPOT'  -> PAYMENT_PIX_SPOT, expiração curta (5 min), normalmente pago na hora via QR.
 * type 'TERM'  -> PAYMENT_PIX_TERM, expiração 24h, para pagamento diferido via copia e cola.
 */
export async function generateComandaPixCharge({
  comandaId,
  amount,
  kind,
  createdByUserId,
}: {
  comandaId: string
  amount: number
  kind: 'SPOT' | 'TERM'
  createdByUserId: string
}) {
  if (amount <= 0) throw new Error('Valor deve ser maior que zero')

  const comanda = await db.comanda.findUniqueOrThrow({
    where: { id: comandaId },
    include: {
      player: { select: { id: true, name: true, cpf: true } },
    },
  })
  if (comanda.status === 'CLOSED') throw new Error('Comanda já está fechada')

  const expiracao = kind === 'TERM' ? 86400 : 300
  const solicitacao = kind === 'TERM'
    ? `Pagamento comanda (24h) — ${comanda.player.name}`
    : `Pagamento comanda (spot) — ${comanda.player.name}`

  const cob = await createNormalizedCob({
    calendario: { expiracao },
    devedor: {
      cpf: comanda.player.cpf ?? undefined,
      nome: comanda.player.name,
    },
    valor: { original: amount.toFixed(2) },
    solicitacaoPagador: solicitacao,
  })

  const type: ComandaItemType = kind === 'SPOT' ? 'PAYMENT_PIX_SPOT' : 'PAYMENT_PIX_TERM'

  // Cria o item via addComandaItem (que ja atualiza balance como PENDING).
  const created = await prisma.$transaction(async (tx: any) => {
    const item = await tx.comandaItem.create({
      data: {
        comandaId,
        type,
        amount,
        description: solicitacao,
        paymentStatus: 'PENDING',
        paymentReference: cob.id ?? null,
        paymentVirtualAccount: cob.virtualAccount ?? null,
        createdByUserId,
      },
    })
    await tx.comanda.update({
      where: { id: comandaId },
      data: { balance: { increment: amount } },
    })
    return item
  })

  return {
    item: created,
    pixCopyPaste: cob.pixCopyPaste ?? null,
    qrCodeBase64: cob.qrCodeBase64 ?? null,
    chargeId: cob.id ?? null,
    expiresIn: expiracao,
  }
}

/**
 * Consulta o status do PIX via Annapay usando o paymentReference (chargeId) do item.
 * Se estiver pago, liquida o item (status PAID) automaticamente.
 * Retorna o status atual do item.
 */
export async function checkComandaItemPixStatus(itemId: string) {
  const item = await db.comandaItem.findUniqueOrThrow({
    where: { id: itemId },
  })

  // Se já está liquidado ou cancelado, não consulta de novo.
  if (item.paymentStatus === 'PAID') {
    return { itemId, status: 'PAID' as const, alreadyPaid: true }
  }
  if (item.paymentStatus === 'EXPIRED' || item.paymentStatus === 'CANCELED') {
    return { itemId, status: item.paymentStatus as 'EXPIRED' | 'CANCELED', alreadyPaid: false }
  }

  if (!item.paymentReference) {
    return { itemId, status: 'PENDING' as const, alreadyPaid: false }
  }

  const { paid } = await checkPixChargeIsPaid(item.paymentReference, item.paymentVirtualAccount ?? undefined)

  if (paid) {
    // Liquida via settleComandaPaymentItem — ele ajusta o balance se necessário.
    await settleComandaPaymentItem({
      itemId: item.id,
      paymentStatus: 'PAID',
    })
    return { itemId, status: 'PAID' as const, alreadyPaid: false }
  }

  return { itemId, status: 'PENDING' as const, alreadyPaid: false }
}

/**
 * Envia um PIX real (via Annapay) ao jogador usando a chave PIX cadastrada dele,
 * e registra a transferência como item TRANSFER_OUT na comanda.
 * Usado quando o jogador tem saldo credor e o host quer pagar o valor em PIX.
 */
export async function sendComandaPixOut({
  comandaId,
  amount,
  createdByUserId,
}: {
  comandaId: string
  amount: number
  createdByUserId: string
}) {
  if (amount <= 0) throw new Error('Valor deve ser maior que zero')

  const comanda = await db.comanda.findUniqueOrThrow({
    where: { id: comandaId },
    include: {
      player: { select: { id: true, name: true, cpf: true, pixKey: true, pixType: true } },
    },
  })
  if (comanda.status === 'CLOSED') throw new Error('Comanda já está fechada')

  const currentBalance = Number(comanda.balance)
  if (currentBalance < amount) {
    throw new Error(`Saldo credor insuficiente (atual: R$ ${currentBalance.toFixed(2)})`)
  }

  const pixKey = (comanda.player.pixKey ?? '').trim()
  const cpf = (comanda.player.cpf ?? '').replace(/\D/g, '')
  if (!pixKey) {
    throw new Error('Jogador não tem chave PIX cadastrada')
  }
  if (!cpf) {
    throw new Error('Jogador não tem CPF cadastrado')
  }

  // Faz o PIX real via Annapay
  let payoutOrder: unknown
  try {
    payoutOrder = await createPix({
      valor: amount,
      descricao: `PIX para ${comanda.player.name}`,
      destinatario: {
        tipo: 'CHAVE',
        chave: pixKey,
        cpfCnpjRecebedor: cpf,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Falha ao enviar PIX via Annapay'
    throw new Error(`Falha no envio do PIX: ${msg}`)
  }

  // Extrai o ID da ordem PIX (se vier)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderId = (payoutOrder as any)?.id
    ?? (payoutOrder as any)?.data?.id
    ?? (payoutOrder as any)?.pixId
    ?? null

  // Registra o item TRANSFER_OUT na comanda — agora que o PIX foi aceito pelo Annapay.
  const item = await prisma.$transaction(async (tx: any) => {
    const created = await tx.comandaItem.create({
      data: {
        comandaId,
        type: 'TRANSFER_OUT',
        amount,
        description: `PIX enviado ao jogador (${pixKey})`,
        paymentReference: typeof orderId === 'string' ? orderId : null,
        createdByUserId,
      },
    })
    await tx.comanda.update({
      where: { id: comandaId },
      data: { balance: { decrement: amount } },
    })
    return created
  })

  return {
    item,
    payoutOrderId: orderId,
    payoutOrder,
  }
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

  // Verifica se o jogador ainda está ativo em algum torneio
  const activeTournamentPlayer = await db.tournamentPlayer.findFirst({
    where: {
      playerId: comanda.playerId,
      status: { in: ['REGISTERED', 'ACTIVE'] },
      tournament: { status: { notIn: ['FINISHED', 'CANCELED'] } },
    },
    include: { tournament: { select: { name: true } } },
  })
  if (activeTournamentPlayer) {
    throw new Error(
      `Jogador ainda está inscrito no torneio "${activeTournamentPlayer.tournament.name}". Elimine ou finalize a participação antes de fechar a comanda.`
    )
  }

  // Verifica se o jogador ainda está em alguma sessão de cash game ativa
  const activeCashGame = await db.playerSessionState.findFirst({
    where: {
      userId: comanda.playerId,
      hasCashedOut: false,
      session: { status: 'ACTIVE' },
    },
    include: { session: { select: { id: true } } },
  })
  if (activeCashGame) {
    throw new Error(
      'Jogador ainda está em uma sessão de Cash Game ativa. Realize o cash out antes de fechar a comanda.'
    )
  }

  return db.comanda.update({
    where: { id: comandaId },
    data: { status: 'CLOSED', closedAt: new Date(), closedByUserId },
    include: {
      player: { select: { id: true, name: true } },
    },
  })
}

// ─── Find or open (used by cashier / sangeur auto-integration) ────────────────

type FindOrOpenParams = {
  playerId: string
  homeGameId: string
  openedByUserId: string
}

// Versão "inner" que opera em uma tx já aberta.
export async function findOrOpenComandaWithTx(tx: any, params: FindOrOpenParams) {
  const { playerId, homeGameId, openedByUserId } = params

  const existing = await tx.comanda.findFirst({
    where: { playerId, homeGameId, status: 'OPEN' },
  })
  if (existing) return existing

  // Nenhuma comanda aberta — abre automaticamente herdando do home game
  const lastClosed = await tx.comanda.findFirst({
    where: { playerId, homeGameId, status: 'CLOSED' },
    orderBy: { closedAt: 'desc' },
  })
  const carryBalance = lastClosed ? Number(lastClosed.balance) : 0

  const resolvedMode = await resolveDefaultComandaMode(playerId, homeGameId)
  // PREPAID estrito: creditLimit 0 pra não acumular fiado silenciosamente.
  // POSTPAID: sem limite por default (null).
  const resolvedCreditLimit = resolvedMode === 'PREPAID' ? 0 : null

  const newComanda = await tx.comanda.create({
    data: {
      playerId,
      homeGameId,
      mode: resolvedMode,
      creditLimit: resolvedCreditLimit,
      note: null,
      openedByUserId,
      balance: carryBalance,
    },
  })
  if (carryBalance !== 0) {
    await tx.comandaItem.create({
      data: {
        comandaId: newComanda.id,
        type: carryBalance > 0 ? 'CARRY_IN' : 'CARRY_OUT',
        amount: Math.abs(carryBalance),
        description: 'Saldo transportado da comanda anterior',
        createdByUserId: openedByUserId,
      },
    })
  }
  return newComanda
}

// Versão pública: envelopa em transaction própria.
export async function findOrOpenComanda(params: FindOrOpenParams) {
  return prisma.$transaction((tx: any) => findOrOpenComandaWithTx(tx, params))
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
