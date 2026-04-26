import { prisma } from '../../lib/prisma'
import { ComandaItemPaymentStatus, ComandaItemType, ComandaMode, Prisma } from '@prisma/client'
import { createNormalizedCob, checkPixChargeIsPaid, createPix } from '../banking/annapay.service'
import { isHomeGameHost } from '../../lib/homegame-auth'
import { logger } from '../../lib/logger'

/**
 * Autorização de acesso a uma comanda:
 * - O próprio jogador (playerId) pode ver/interagir com a SUA comanda.
 * - Host/co-host/admin do home game pode ver/interagir com qualquer comanda do HG.
 *
 * `managerOnly=true` exige host/co-host (usado em ações gerenciais: abrir, fechar,
 * registrar item, gerar PIX, enviar PIX, liquidar). O jogador não pode executar.
 */
async function assertComandaAccess(
  viewerUserId: string,
  comandaIdOrPlayerAndHomeGame:
    | { comandaId: string }
    | { playerId: string; homeGameId: string },
  options: { managerOnly?: boolean } = {},
) {
  let homeGameId: string
  let playerId: string

  if ('comandaId' in comandaIdOrPlayerAndHomeGame) {
    const comanda = await db.comanda.findUniqueOrThrow({
      where: { id: comandaIdOrPlayerAndHomeGame.comandaId },
      select: { homeGameId: true, playerId: true },
    })
    homeGameId = comanda.homeGameId
    playerId = comanda.playerId
  } else {
    homeGameId = comandaIdOrPlayerAndHomeGame.homeGameId
    playerId = comandaIdOrPlayerAndHomeGame.playerId
  }

  const isManager = await isHomeGameHost(viewerUserId, homeGameId)
  if (isManager) return { isManager: true, isOwnComanda: viewerUserId === playerId }

  if (options.managerOnly) {
    throw new Error('Acesso negado — apenas host/co-host pode executar esta ação')
  }

  if (viewerUserId === playerId) return { isManager: false, isOwnComanda: true }

  throw new Error('Acesso negado')
}

// Enums agora vêm de @prisma/client (acima). Mantido alias `db` para reduzir
// churn do diff — pode ser removido gradualmente em troca de `prisma` direto.
const db = prisma

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
  // MemberPaymentMode e ComandaMode têm os mesmos valores ('PREPAID'|'POSTPAID'),
  // mas TypeScript trata como enums distintos — mapeamos explicitamente.
  if (member?.paymentMode === 'PREPAID') return ComandaMode.PREPAID
  if (member?.paymentMode === 'POSTPAID') return ComandaMode.POSTPAID
  return ComandaMode.POSTPAID
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
  // Somente host/co-host pode abrir comanda pra outro jogador.
  await assertComandaAccess(openedByUserId, { playerId, homeGameId }, { managerOnly: true })

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

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

export async function getComanda(comandaId: string, viewerUserId: string) {
  await assertComandaAccess(viewerUserId, { comandaId })
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
  viewerUserId,
}: {
  playerId: string
  homeGameId: string
  viewerUserId: string
}) {
  await assertComandaAccess(viewerUserId, { playerId, homeGameId })
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
  viewerUserId,
}: {
  homeGameId: string
  status?: 'OPEN' | 'CLOSED'
  viewerUserId: string
}) {
  // Listagem completa é só pra host/co-host. Jogador comum usa getComandaByPlayer.
  const isManager = await isHomeGameHost(viewerUserId, homeGameId)
  if (!isManager) throw new Error('Acesso negado — apenas host/co-host pode listar comandas')
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
export async function addComandaItemWithTx(tx: Prisma.TransactionClient, params: AddComandaItemParams) {
  const { comandaId, type, amount, description, sessionId, tournamentId, tournamentPlayerId, transactionId, createdByUserId } = params

  const comanda = await tx.comanda.findUniqueOrThrow({ where: { id: comandaId } })
  // Em comanda fechada, só aceitamos pagamentos (pra quitar saldo devedor/credor).
  // Débitos (BUYIN/REBUY/etc) continuam bloqueados — comanda fechada não deve receber novos consumos.
  if (comanda.status === 'CLOSED' && !isPaymentType(type) && type !== 'TRANSFER_IN' && type !== 'TRANSFER_OUT') {
    throw new Error('Comanda já está fechada')
  }

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

// Versão pública: envelopa em transaction própria + exige host/co-host.
export async function addComandaItem(params: AddComandaItemParams) {
  await assertComandaAccess(params.createdByUserId, { comandaId: params.comandaId }, { managerOnly: true })
  return prisma.$transaction((tx: Prisma.TransactionClient) => addComandaItemWithTx(tx, params))
}

// ─── Settle payment item ──────────────────────────────────────────────────────

export async function settleComandaPaymentItem({
  itemId,
  paymentReference,
  paymentVirtualAccount,
  paymentStatus,
  viewerUserId,
}: {
  itemId: string
  paymentReference?: string
  paymentVirtualAccount?: string
  paymentStatus: ComandaItemPaymentStatus
  viewerUserId?: string  // opcional: uso interno (check pix status) passa sem, rota passa com
}) {
  // Se veio de rota HTTP, valida permissão.
  if (viewerUserId) {
    const item = await db.comandaItem.findUniqueOrThrow({
      where: { id: itemId },
      select: { comandaId: true },
    })
    await assertComandaAccess(viewerUserId, { comandaId: item.comandaId }, { managerOnly: true })
  }
  // Ajusta balance conforme a transição de paymentStatus.
  // Regra: enquanto o item foi criado via addComandaItem, o balance já foi
  // incrementado no momento da criação (independente do status ser PENDING ou PAID).
  // Se o pagamento "sair" do crédito (EXPIRED/CANCELED), precisamos reverter.
  // Se um pagamento CANCELED/EXPIRED voltar a PAID (ex.: reativação manual),
  // precisamos re-creditar.
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
  await assertComandaAccess(createdByUserId, { comandaId }, { managerOnly: true })

  const comanda = await db.comanda.findUniqueOrThrow({
    where: { id: comandaId },
    include: {
      player: { select: { id: true, name: true, cpf: true } },
    },
  })
  // Permite gerar cobrança mesmo com comanda fechada — muitas vezes o host precisa
  // cobrar saldo devedor depois de ter fechado. O item entra como pagamento normal
  // e reequilibra o balance.

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
  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
 *
 * Quando confirma pagamento de PIX de COBRANÇA (PAYMENT_PIX_SPOT/TERM),
 * adiciona entrada na conta bancária do home game.
 */
export async function checkComandaItemPixStatus(itemId: string, viewerUserId: string) {
  const item = await db.comandaItem.findUniqueOrThrow({
    where: { id: itemId },
    include: {
      comanda: { select: { homeGameId: true } },
    },
  })
  // Tanto o jogador dono da comanda quanto host/co-host podem consultar.
  await assertComandaAccess(viewerUserId, { comandaId: item.comandaId })

  // Se já está liquidado, verifica se a bank transaction correspondente existe.
  // Isso cobre items que foram marcados PAID antes do sistema de conta bancária existir.
  if (item.paymentStatus === 'PAID') {
    const isPixIn = item.type === 'PAYMENT_PIX_SPOT' || item.type === 'PAYMENT_PIX_TERM'
    if (isPixIn && item.comanda?.homeGameId) {
      const existingBankTx = await db.homeGameBankTransaction.findFirst({
        where: { comandaItemId: item.id },
        select: { id: true },
      })
      if (!existingBankTx) {
        await recordBankTransaction({
          homeGameId: item.comanda.homeGameId,
          direction: 'IN',
          amount: Number(item.amount),
          description: `PIX recebido (${item.type}) — reconciliação`,
          comandaItemId: item.id,
          annapayRef: item.paymentReference ?? null,
        })
      }
    }
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
    // Lança entrada na conta bancária do home game (PIX recebido confirmado).
    const isPixIn = item.type === 'PAYMENT_PIX_SPOT' || item.type === 'PAYMENT_PIX_TERM'
    if (isPixIn && item.comanda?.homeGameId) {
      await recordBankTransaction({
        homeGameId: item.comanda.homeGameId,
        direction: 'IN',
        amount: Number(item.amount),
        description: `PIX recebido (${item.type})`,
        comandaItemId: item.id,
        annapayRef: item.paymentReference ?? null,
      })
    }
    return { itemId, status: 'PAID' as const, alreadyPaid: false }
  }

  return { itemId, status: 'PENDING' as const, alreadyPaid: false }
}

/**
 * Registra uma movimentação na conta bancária virtual do home game
 * e atualiza o `bankBalance`. Usado por entradas (PIX recebido) e saídas (PIX enviado).
 */
/**
 * Reconcilia o saldo bancário do home game: varre items PIX já pagos que ainda
 * não têm bank transaction correspondente e gera os lançamentos retroativos.
 * Também reconcilia TRANSFER_OUT confirmados (PAID) sem bank tx.
 */
export async function reconcileHomeGameBank(homeGameId: string, viewerUserId: string) {
  logger.info({ homeGameId, viewerUserId }, '[reconcile] start')
  try {
    const isManager = await isHomeGameHost(viewerUserId, homeGameId)
    logger.debug({ isManager }, '[reconcile] isManager?')
    if (!isManager) throw new Error('Acesso negado — apenas host/co-host pode reconciliar')

    const items = await db.comandaItem.findMany({
      where: {
        comanda: { homeGameId },
        paymentStatus: 'PAID',
        type: { in: ['PAYMENT_PIX_SPOT', 'PAYMENT_PIX_TERM', 'TRANSFER_OUT'] },
      },
      select: { id: true, type: true, amount: true, paymentReference: true },
    })
    logger.debug({ count: items.length }, '[reconcile] items to check')

    const existingTxs = items.length > 0
      ? await db.homeGameBankTransaction.findMany({
          where: { homeGameId, comandaItemId: { in: items.map((i) => i.id) } },
          select: { comandaItemId: true },
        })
      : []
    const existingSet = new Set(existingTxs.map((t) => t.comandaItemId))
    logger.debug({ count: existingTxs.length }, '[reconcile] existing bank txs')

    let created = 0
    for (const it of items) {
      if (existingSet.has(it.id)) continue
      const direction = it.type === 'TRANSFER_OUT' ? 'OUT' : 'IN'
      logger.info({ itemId: it.id, direction, amount: Number(it.amount) }, '[reconcile] creating bank tx')
      await recordBankTransaction({
        homeGameId,
        direction,
        amount: Number(it.amount),
        description: `${direction === 'IN' ? 'PIX recebido' : 'PIX enviado'} (${it.type}) — reconciliação`,
        comandaItemId: it.id,
        annapayRef: it.paymentReference ?? null,
      })
      created += 1
    }

    const home = await db.homeGame.findUniqueOrThrow({
      where: { id: homeGameId },
      select: { bankBalance: true },
    })

    logger.info({ created, newBalance: Number(home.bankBalance) }, '[reconcile] done')
    return {
      reconciledCount: created,
      newBalance: Number(home.bankBalance),
    }
  } catch (err) {
    logger.error({ err }, '[reconcile] error')
    throw err
  }
}

/**
 * Retorna saldo bancário + últimas movimentações do home game.
 * Qualquer membro autenticado pode ver (incluindo jogador, pra transparência).
 */
export async function getHomeGameBank(homeGameId: string, viewerUserId: string, limit = 50) {
  // Permissão: membro ou host. Jogador comum pode ver o extrato pra auditar.
  const isManager = await isHomeGameHost(viewerUserId, homeGameId)
  if (!isManager) {
    const member = await db.homeGameMember.findUnique({
      where: { homeGameId_userId: { homeGameId, userId: viewerUserId } },
      select: { id: true },
    })
    const game = await db.homeGame.findUnique({ where: { id: homeGameId }, select: { hostId: true } })
    if (!member && game?.hostId !== viewerUserId) {
      throw new Error('Acesso negado')
    }
  }

  const [home, transactions] = await Promise.all([
    db.homeGame.findUniqueOrThrow({
      where: { id: homeGameId },
      select: { id: true, name: true, bankBalance: true },
    }),
    db.homeGameBankTransaction.findMany({
      where: { homeGameId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    }),
  ])

  return {
    homeGameId: home.id,
    homeGameName: home.name,
    balance: Number(home.bankBalance),
    transactions: transactions.map((t) => ({
      id: t.id,
      direction: t.direction,
      amount: Number(t.amount),
      description: t.description,
      comandaItemId: t.comandaItemId,
      annapayRef: t.annapayRef,
      createdAt: t.createdAt,
    })),
  }
}

async function recordBankTransaction(params: {
  homeGameId: string
  direction: 'IN' | 'OUT'
  amount: number
  description?: string | null
  comandaItemId?: string | null
  annapayRef?: string | null
}) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.homeGameBankTransaction.create({
      data: {
        homeGameId: params.homeGameId,
        direction: params.direction,
        amount: params.amount,
        description: params.description ?? null,
        comandaItemId: params.comandaItemId ?? null,
        annapayRef: params.annapayRef ?? null,
      },
    })
    await tx.homeGame.update({
      where: { id: params.homeGameId },
      data: {
        bankBalance: {
          [params.direction === 'IN' ? 'increment' : 'decrement']: params.amount,
        },
      },
    })
  })
}

/**
 * Envia um PIX real (via Annapay) ao jogador usando a chave PIX cadastrada dele,
 * e registra a transferência como item TRANSFER_OUT na comanda.
 *
 * ESTRATÉGIA — processamento em background:
 * 1. Valida saldo + chave PIX (rápido)
 * 2. Cria item TRANSFER_OUT com paymentStatus PENDING e decrementa balance (rápido)
 * 3. Retorna imediatamente pro frontend
 * 4. Em background (setImmediate), chama o Annapay; se sucesso atualiza item pra PAID,
 *    se falha reverte o balance e marca item como CANCELED.
 *
 * Dessa forma o host não precisa esperar o banco responder pra liberar a UI.
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
  await assertComandaAccess(createdByUserId, { comandaId }, { managerOnly: true })

  const comanda = await db.comanda.findUniqueOrThrow({
    where: { id: comandaId },
    include: {
      player: { select: { id: true, name: true, cpf: true, pixKey: true, pixType: true } },
    },
  })
  // Permite enviar PIX mesmo com comanda fechada — host pode querer quitar saldo
  // credor após o fechamento.

  const currentBalance = Number(comanda.balance)
  if (currentBalance < amount) {
    throw new Error(`Saldo credor insuficiente (atual: R$ ${currentBalance.toFixed(2)})`)
  }

  const pixKey = (comanda.player.pixKey ?? '').trim()
  const cpf = (comanda.player.cpf ?? '').replace(/\D/g, '')
  if (!pixKey) throw new Error('Jogador não tem chave PIX cadastrada')
  if (!cpf) throw new Error('Jogador não tem CPF cadastrado')

  // Valida saldo da conta bancária do home game — não pode pagar sem ter dinheiro.
  const homeGame = await db.homeGame.findUniqueOrThrow({
    where: { id: comanda.homeGameId },
    select: { bankBalance: true },
  })
  const bankBalance = Number(homeGame.bankBalance)
  if (bankBalance < amount) {
    throw new Error(`Sem saldo na conta do home game (atual: R$ ${bankBalance.toFixed(2)}). Aguarde entradas de PIX antes de pagar.`)
  }

  // 1) Cria item PENDING + decrementa balance IMEDIATAMENTE
  const item = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.comandaItem.create({
      data: {
        comandaId,
        type: 'TRANSFER_OUT',
        amount,
        description: `PIX enviado ao jogador (${pixKey})`,
        paymentStatus: 'PENDING',
        createdByUserId,
      },
    })
    await tx.comanda.update({
      where: { id: comandaId },
      data: { balance: { decrement: amount } },
    })
    return created
  })

  // 2) Dispara chamada Annapay em background — não bloqueia a resposta.
  const playerName = comanda.player.name
  setImmediate(async () => {
    try {
      const payoutOrder = await createPix({
        valor: amount,
        descricao: `PIX para ${playerName}`,
        destinatario: {
          tipo: 'CHAVE',
          chave: pixKey,
          cpfCnpjRecebedor: cpf,
        },
      })

      // Resposta do Annapay varia conforme o endpoint (pix spot vs término).
      // Narrowing manual pra evitar `any` explícito.
      const payout = payoutOrder as { id?: unknown; data?: { id?: unknown }; pixId?: unknown } | null | undefined
      const rawId = payout?.id ?? payout?.data?.id ?? payout?.pixId ?? null
      const orderId = typeof rawId === 'string' ? rawId : null

      await db.comandaItem.update({
        where: { id: item.id },
        data: {
          paymentStatus: 'PAID',
          paymentReference: orderId,
        },
      })
      // Debita a conta bancária do home game — PIX confirmado pelo Annapay.
      await recordBankTransaction({
        homeGameId: comanda.homeGameId,
        direction: 'OUT',
        amount,
        description: `PIX enviado para ${playerName}`,
        comandaItemId: item.id,
        annapayRef: orderId,
      })
    } catch (err) {
      // PIX falhou — reverte o balance e marca item como CANCELED
      logger.error({ err, itemId: item.id }, '[comanda pix-out] falha no envio do PIX')
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.comandaItem.update({
            where: { id: item.id },
            data: {
              paymentStatus: 'CANCELED',
              description: `[Falha no envio] PIX para ${playerName}`,
            },
          })
          await tx.comanda.update({
            where: { id: comandaId },
            data: { balance: { increment: amount } },
          })
        })
      } catch (rollbackErr) {
        logger.error({ err: rollbackErr, itemId: item.id }, '[comanda pix-out] falha ao reverter item')
      }
    }
  })

  return { item }
}

// ─── Fechar caixa (relatório agregado do home game) ──────────────────────────
/**
 * Gera relatório agregado de todas atividades financeiras do home game.
 * Inclui totais de débitos/créditos, cash recebido, PIX entrada/saída, rake,
 * caixinha, rakeback e saldos pendentes. Não fecha comandas automaticamente —
 * retorna status pra host decidir (se quiser fechar comandas zeradas, fazer via UI).
 *
 * Filtros opcionais: `from`/`to` pra limitar ao período (por default, todo histórico).
 */
export async function closeCashbox({
  homeGameId,
  viewerUserId,
  from,
  to,
}: {
  homeGameId: string
  viewerUserId: string
  from?: Date
  to?: Date
}) {
  const isManager = await isHomeGameHost(viewerUserId, homeGameId)
  if (!isManager) throw new Error('Acesso negado — apenas host/co-host pode fechar o caixa')

  const homeGame = await db.homeGame.findUniqueOrThrow({
    where: { id: homeGameId },
    select: { bankBalance: true },
  })

  const itemWhere: Prisma.ComandaItemWhereInput = { comanda: { homeGameId } }
  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {}
    if (from) createdAt.gte = from
    if (to) createdAt.lte = to
    itemWhere.createdAt = createdAt
  }

  const items = await db.comandaItem.findMany({
    where: itemWhere,
    select: {
      type: true,
      amount: true,
      paymentStatus: true,
      sessionId: true,
      comanda: {
        select: {
          player: { select: { id: true, name: true } },
        },
      },
      session: {
        select: { id: true, name: true, startedAt: true },
      },
    },
  })

  // ── Rake: vem diretamente das CashTables fechadas no período ────────────────
  const tableWhere: Record<string, unknown> = {
    status: 'CLOSED',
    session: { homeGameId },
  }
  if (from || to) {
    const closedAt: Record<string, Date> = {}
    if (from) closedAt.gte = from
    if (to) closedAt.lte = to
    tableWhere.closedAt = closedAt
  }
  const closedTables = await db.cashTable.findMany({
    where: tableWhere,
    select: {
      id: true,
      name: true,
      rake: true,
      session: { select: { id: true, name: true, startedAt: true } },
    },
  })

  const comandas = await db.comanda.findMany({
    where: { homeGameId },
    select: {
      id: true,
      status: true,
      balance: true,
      openedAt: true,
      player: { select: { id: true, name: true } },
    },
  })

  const sessions = await db.session.count({ where: { homeGameId } })
  const tournaments = await db.tournament.count({ where: { homeGameId } })

  const totals = {
    totalDebits: 0,
    totalCredits: 0,
    totalCash: 0,
    totalPixIn: 0,
    totalPixOut: 0,
    totalRake: 0,
    totalCaixinha: 0,
    totalRakeback: 0,
    totalPendingPix: 0,
  }

  // Agregações detalhadas
  const creditsByPlayer = new Map<string, { playerId: string; name: string; amount: number }>()
  const debitsByPlayer = new Map<string, { playerId: string; name: string; amount: number }>()
  const paymentsByType = {
    PAYMENT_CASH: 0,
    PAYMENT_CARD: 0,
    PAYMENT_PIX_SPOT: 0,
    PAYMENT_PIX_TERM: 0,
  } as Record<string, number>

  // Quem pagou via cada método (jogadores para o home game)
  const cashByPlayer = new Map<string, { playerId: string; name: string; amount: number }>()
  const cardByPlayer = new Map<string, { playerId: string; name: string; amount: number }>()
  const pixInByPlayer = new Map<string, { playerId: string; name: string; amount: number }>()
  // Quem recebeu PIX do home game (TRANSFER_OUT)
  const pixOutByPlayer = new Map<string, { playerId: string; name: string; amount: number }>()

  // Caixinha por sessão + por destinatário
  const caixinhaBySession = new Map<string, { sessionId: string; sessionName: string; amount: number; recipients: Map<string, { name: string; amount: number }> }>()
  // Rakeback por sessão + por destinatário
  const rakebackBySession = new Map<string, { sessionId: string; sessionName: string; amount: number; recipients: Map<string, { name: string; amount: number }> }>()

  function bumpByPlayer(
    map: Map<string, { playerId: string; name: string; amount: number }>,
    playerId: string,
    playerName: string,
    amt: number,
  ) {
    const e = map.get(playerId) ?? { playerId, name: playerName, amount: 0 }
    e.amount += amt
    map.set(playerId, e)
  }

  for (const it of items) {
    const amt = Number(it.amount)
    const type = it.type as string
    const effective = it.paymentStatus === 'PAID' || it.paymentStatus === null
    const playerId = it.comanda?.player?.id
    const playerName = it.comanda?.player?.name ?? '—'

    if (isDebitType(type as ComandaItemType)) {
      totals.totalDebits += amt
      if (playerId) {
        const e = debitsByPlayer.get(playerId) ?? { playerId, name: playerName, amount: 0 }
        e.amount += amt
        debitsByPlayer.set(playerId, e)
      }
    }
    const isCreditType = isPaymentType(type as ComandaItemType) || type === 'CASH_CASHOUT' ||
        type === 'TRANSFER_IN' || type === 'CARRY_IN' ||
        type === 'STAFF_CAIXINHA' || type === 'STAFF_RAKEBACK' ||
        type === 'TOURNAMENT_BOUNTY_RECEIVED' || type === 'TOURNAMENT_PRIZE'
    if (isCreditType && effective) {
      totals.totalCredits += amt
      if (playerId) {
        const e = creditsByPlayer.get(playerId) ?? { playerId, name: playerName, amount: 0 }
        e.amount += amt
        creditsByPlayer.set(playerId, e)
      }
    }
    if (type === 'PAYMENT_CASH' && effective) {
      totals.totalCash += amt
      if (playerId) bumpByPlayer(cashByPlayer, playerId, playerName, amt)
    }
    if ((type === 'PAYMENT_PIX_SPOT' || type === 'PAYMENT_PIX_TERM') && effective) {
      totals.totalPixIn += amt
      if (playerId) bumpByPlayer(pixInByPlayer, playerId, playerName, amt)
    }
    if ((type === 'PAYMENT_PIX_SPOT' || type === 'PAYMENT_PIX_TERM') && it.paymentStatus === 'PENDING') {
      totals.totalPendingPix += amt
    }
    if (type === 'TRANSFER_OUT' && effective) {
      totals.totalPixOut += amt
      if (playerId) bumpByPlayer(pixOutByPlayer, playerId, playerName, amt)
    }
    if (type === 'PAYMENT_CARD' && effective && playerId) {
      bumpByPlayer(cardByPlayer, playerId, playerName, amt)
    }
    if (type === 'STAFF_CAIXINHA') {
      totals.totalCaixinha += amt
      const sid = it.sessionId ?? '__no_session__'
      const sName = it.session?.name ?? (it.session?.startedAt ? new Date(it.session.startedAt).toLocaleDateString('pt-BR') : 'Partida')
      const entry = caixinhaBySession.get(sid) ?? { sessionId: sid, sessionName: sName, amount: 0, recipients: new Map() }
      entry.amount += amt
      if (playerId) {
        const rec = entry.recipients.get(playerId) ?? { name: playerName, amount: 0 }
        rec.amount += amt
        entry.recipients.set(playerId, rec)
      }
      caixinhaBySession.set(sid, entry)
    }
    if (type === 'STAFF_RAKEBACK') {
      totals.totalRakeback += amt
      const sid = it.sessionId ?? '__no_session__'
      const sName = it.session?.name ?? (it.session?.startedAt ? new Date(it.session.startedAt).toLocaleDateString('pt-BR') : 'Partida')
      const entry = rakebackBySession.get(sid) ?? { sessionId: sid, sessionName: sName, amount: 0, recipients: new Map() }
      entry.amount += amt
      if (playerId) {
        const rec = entry.recipients.get(playerId) ?? { name: playerName, amount: 0 }
        rec.amount += amt
        entry.recipients.set(playerId, rec)
      }
      rakebackBySession.set(sid, entry)
    }
    if (effective && (type === 'PAYMENT_CASH' || type === 'PAYMENT_CARD' ||
        type === 'PAYMENT_PIX_SPOT' || type === 'PAYMENT_PIX_TERM')) {
      paymentsByType[type] = (paymentsByType[type] ?? 0) + amt
    }
  }

  // Rake: soma das CashTables fechadas no período
  totals.totalRake = closedTables.reduce((s, t) => s + Number(t.rake), 0)

  // Round money
  for (const k of Object.keys(totals) as Array<keyof typeof totals>) {
    totals[k] = Number(totals[k].toFixed(2))
  }

  const open = comandas.filter((c) => c.status === 'OPEN')
  const closed = comandas.filter((c) => c.status === 'CLOSED')
  const openBalancesTotal = open.reduce((s, c) => s + Number(c.balance), 0)
  const playersWithDebt = open.filter((c) => Number(c.balance) < 0).length
  const playersWithCredit = open.filter((c) => Number(c.balance) > 0).length

  const round = (n: number) => Number(n.toFixed(2))

  return {
    generatedAt: new Date().toISOString(),
    periodStart: from?.toISOString() ?? null,
    periodEnd: to?.toISOString() ?? null,
    totals,
    comandasClosed: closed.length,
    comandasStillOpen: open.length,
    openBalancesTotal: Number(openBalancesTotal.toFixed(2)),
    playersWithDebt,
    playersWithCredit,
    sessionsCount: sessions,
    tournamentsCount: tournaments,
    paymentsByType: Object.fromEntries(
      Object.entries(paymentsByType).map(([k, v]) => [k, round(v as number)]),
    ),
    cashByPlayer: Array.from(cashByPlayer.values())
      .map((e) => ({ ...e, amount: round(e.amount) }))
      .sort((a, b) => b.amount - a.amount),
    cardByPlayer: Array.from(cardByPlayer.values())
      .map((e) => ({ ...e, amount: round(e.amount) }))
      .sort((a, b) => b.amount - a.amount),
    pixInByPlayer: Array.from(pixInByPlayer.values())
      .map((e) => ({ ...e, amount: round(e.amount) }))
      .sort((a, b) => b.amount - a.amount),
    pixOutByPlayer: Array.from(pixOutByPlayer.values())
      .map((e) => ({ ...e, amount: round(e.amount) }))
      .sort((a, b) => b.amount - a.amount),
    creditsByPlayer: Array.from(creditsByPlayer.values())
      .map((e) => ({ ...e, amount: round(e.amount) }))
      .sort((a, b) => b.amount - a.amount),
    debitsByPlayer: Array.from(debitsByPlayer.values())
      .map((e) => ({ ...e, amount: round(e.amount) }))
      .sort((a, b) => b.amount - a.amount),
    // Rake por mesa (tabela fechada no período)
    rakeByTable: closedTables
      .filter(t => Number(t.rake) > 0)
      .map(t => ({
        tableId: t.id,
        tableName: t.name,
        sessionName: t.session.name ?? (t.session.startedAt ? new Date(t.session.startedAt).toLocaleDateString('pt-BR') : 'Partida'),
        amount: round(Number(t.rake)),
      }))
      .sort((a, b) => b.amount - a.amount),
    // Caixinha por sessão com destinatários
    caixinhaBySession: Array.from(caixinhaBySession.values()).map(e => ({
      sessionId: e.sessionId,
      sessionName: e.sessionName,
      amount: round(e.amount),
      recipients: Array.from(e.recipients.entries()).map(([id, r]) => ({ playerId: id, name: r.name, amount: round(r.amount) })),
    })).sort((a, b) => b.amount - a.amount),
    // Rakeback por sessão com destinatários
    rakebackBySession: Array.from(rakebackBySession.values()).map(e => ({
      sessionId: e.sessionId,
      sessionName: e.sessionName,
      amount: round(e.amount),
      recipients: Array.from(e.recipients.entries()).map(([id, r]) => ({ playerId: id, name: r.name, amount: round(r.amount) })),
    })).sort((a, b) => b.amount - a.amount),
    openComandas: open.map((c) => ({
      id: c.id,
      playerId: c.player.id,
      playerName: c.player.name,
      balance: Number(c.balance),
      openedAt: c.openedAt,
    })).sort((a, b) => a.balance - b.balance), // devedores primeiro
    closedComandasDetail: closed.slice(0, 50).map((c) => ({
      id: c.id,
      playerName: c.player.name,
      balance: Number(c.balance),
      status: c.status,
    })),
    bankBalance: Number(homeGame.bankBalance),
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
  await assertComandaAccess(closedByUserId, { comandaId }, { managerOnly: true })
  const comanda = await db.comanda.findUniqueOrThrow({
    where: { id: comandaId },
    include: { items: true },
  })
  if (comanda.status === 'CLOSED') throw new Error('Comanda já está fechada')

  const hasPendingPayments = comanda.items.some(
    (i) => isPaymentType(i.type) && i.paymentStatus === 'PENDING',
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

  // Verifica se o jogador ainda tem seat ativo em mesa aberta de cash game.
  // Usar CashTableSeat (não playerSessionState) porque um jogador pode ter
  // hasCashedOut=false no estado da sessão mesmo com todas as mesas fechadas
  // via sangria — o que não deve bloquear o fechamento da comanda.
  const activeCashSeat = await db.cashTableSeat.findFirst({
    where: {
      userId: comanda.playerId,
      hasCashedOut: false,
      table: {
        status: 'OPEN',
        session: { status: 'ACTIVE' },
      },
    },
  })
  if (activeCashSeat) {
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
export async function findOrOpenComandaWithTx(tx: Prisma.TransactionClient, params: FindOrOpenParams) {
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
  return prisma.$transaction((tx: Prisma.TransactionClient) => findOrOpenComandaWithTx(tx, params))
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
