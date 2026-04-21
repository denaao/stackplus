/**
 * OpenAPI 3.1 spec da API StackPlus.
 *
 * Spec declarada manualmente (não auto-gerada dos Zod schemas). Motivo: os
 * schemas Zod existentes estão inline nas rotas, refatorar pra expor tudo
 * seria trabalho grande. Manutenção: quando adicionar/alterar rota crítica,
 * atualizar esta spec junto.
 *
 * Documentação interativa: GET /api/docs
 * Spec JSON:                GET /api/openapi.json
 *
 * Escopo: endpoints REST principais. Não inclui:
 *  - Webhook ANNAPAY (recebimento externo, doc é do ANNAPAY)
 *  - Socket.io events (não são HTTP)
 *  - Rotas admin/debug
 */

// Reusable schema fragments
const uuid = { type: 'string', format: 'uuid' as const }
const isoDateTime = { type: 'string', format: 'date-time' as const }
const moneyDecimal = { type: 'string', description: 'Decimal com 2 casas (ex: "100.00")' }
const errorResponse = {
  type: 'object' as const,
  properties: {
    error: { type: 'string' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
}

const bearerAuth = [{ bearerAuth: [] }]

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'StackPlus API',
    version: '1.0.0',
    description:
      'API do StackPlus — gerenciamento de home games de poker (cash e torneios), com integração PIX via ANNAPAY e operação SANGEUR.',
  },
  servers: [
    { url: 'https://stackplus-api.up.railway.app/api', description: 'Produção' },
    { url: 'http://localhost:3001/api', description: 'Desenvolvimento local' },
  ],
  tags: [
    { name: 'auth', description: 'Autenticação e sessão' },
    { name: 'homegame', description: 'Home games (clubes de poker)' },
    { name: 'session', description: 'Sessões de cash game' },
    { name: 'cashier', description: 'Caixa — transações de buy-in/cashout' },
    { name: 'comanda', description: 'Comandas financeiras dos jogadores' },
    { name: 'tournament', description: 'Torneios' },
    { name: 'banking', description: 'Integração bancária (ANNAPAY PIX)' },
    { name: 'sangeur', description: 'Módulo operacional SANGEUR' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: uuid,
          name: { type: 'string' },
          cpf: { type: 'string' },
          email: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['PLAYER', 'ADMIN'] },
          pixType: { type: 'string', enum: ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'], nullable: true },
          pixKey: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          createdAt: isoDateTime,
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
          token: { type: 'string', description: 'Access token JWT (15min)' },
          refreshToken: { type: 'string', description: 'Refresh token (30d). Use em POST /auth/refresh' },
          refreshTokenExpiresAt: isoDateTime,
        },
      },
      HomeGame: {
        type: 'object',
        properties: {
          id: uuid,
          name: { type: 'string' },
          gameType: { type: 'string', enum: ['CASH_GAME', 'TOURNAMENT'] },
          address: { type: 'string' },
          dayOfWeek: { type: 'string' },
          startTime: { type: 'string' },
          chipValue: moneyDecimal,
          joinCode: { type: 'string' },
          hostId: uuid,
          financialModule: { type: 'string', enum: ['POSTPAID', 'PREPAID', 'HYBRID'] },
          bankBalance: moneyDecimal,
        },
      },
      Session: {
        type: 'object',
        properties: {
          id: uuid,
          homeGameId: uuid,
          status: { type: 'string', enum: ['WAITING', 'ACTIVE', 'FINISHED'] },
          chipValue: { type: 'string', nullable: true },
          startedAt: { ...isoDateTime, nullable: true },
          finishedAt: { ...isoDateTime, nullable: true },
          rake: { ...moneyDecimal, nullable: true },
          caixinha: { ...moneyDecimal, nullable: true },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: uuid,
          sessionId: uuid,
          userId: uuid,
          type: { type: 'string', enum: ['BUYIN', 'REBUY', 'ADDON', 'CASHOUT', 'JACKPOT'] },
          amount: moneyDecimal,
          chips: { type: 'integer' },
          note: { type: 'string', nullable: true },
          origin: { type: 'string', enum: ['C', 'S'], description: 'C=cashier, S=sangeur' },
          createdAt: isoDateTime,
        },
      },
      Comanda: {
        type: 'object',
        properties: {
          id: uuid,
          playerId: uuid,
          homeGameId: uuid,
          status: { type: 'string', enum: ['OPEN', 'CLOSED'] },
          mode: { type: 'string', enum: ['PREPAID', 'POSTPAID'] },
          balance: moneyDecimal,
          creditLimit: { ...moneyDecimal, nullable: true },
          openedAt: isoDateTime,
          closedAt: { ...isoDateTime, nullable: true },
        },
      },
      ComandaItem: {
        type: 'object',
        properties: {
          id: uuid,
          comandaId: uuid,
          type: {
            type: 'string',
            enum: [
              'CASH_BUYIN', 'CASH_REBUY', 'CASH_ADDON', 'CASH_CASHOUT',
              'TOURNAMENT_BUYIN', 'TOURNAMENT_REBUY', 'TOURNAMENT_ADDON',
              'TOURNAMENT_BOUNTY_RECEIVED', 'TOURNAMENT_PRIZE',
              'PAYMENT_PIX_SPOT', 'PAYMENT_PIX_TERM', 'PAYMENT_CASH', 'PAYMENT_CARD',
              'TRANSFER_IN', 'TRANSFER_OUT', 'CARRY_IN', 'CARRY_OUT',
              'STAFF_CAIXINHA', 'STAFF_RAKEBACK',
            ],
          },
          amount: moneyDecimal,
          paymentStatus: { type: 'string', enum: ['PENDING', 'PAID', 'EXPIRED', 'CANCELED'], nullable: true },
          description: { type: 'string', nullable: true },
          createdAt: isoDateTime,
        },
      },
      Tournament: {
        type: 'object',
        properties: {
          id: uuid,
          homeGameId: uuid,
          name: { type: 'string' },
          status: { type: 'string', enum: ['REGISTRATION', 'RUNNING', 'ON_BREAK', 'FINISHED', 'CANCELED'] },
          buyInAmount: moneyDecimal,
          startingChips: { type: 'integer' },
          prizePool: moneyDecimal,
          totalRake: moneyDecimal,
          currentLevel: { type: 'integer' },
        },
      },
      Error: errorResponse,
    },
  },
  security: bearerAuth,
  paths: {
    // ─── AUTH ────────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['auth'],
        summary: 'Cadastro de novo usuário',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'cpf', 'password', 'pixType', 'pixKey'],
                properties: {
                  name: { type: 'string', minLength: 3, maxLength: 120 },
                  cpf: { type: 'string', description: '11 dígitos (com ou sem máscara)' },
                  email: { type: 'string', format: 'email', nullable: true },
                  phone: { type: 'string', nullable: true },
                  password: { type: 'string', minLength: 8, maxLength: 120 },
                  pixType: { type: 'string', enum: ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'] },
                  pixKey: { type: 'string', minLength: 3, maxLength: 120 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Usuário criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          400: { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'CPF ou email já cadastrado' },
          429: { description: 'Muitas contas deste IP (rate limit)' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Login com CPF + senha',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cpf', 'password'],
                properties: {
                  cpf: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Credenciais inválidas' },
          429: { description: 'Muitas tentativas (rate limit: 5/15min)' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['auth'],
        summary: 'Rotaciona access token via refresh token (SEC-004)',
        description: 'Revoga o refresh token antigo e emite novo par. Use quando access token expirar (15min).',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Novo par emitido',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    refreshToken: { type: 'string' },
                    refreshTokenExpiresAt: isoDateTime,
                  },
                },
              },
            },
          },
          400: { description: 'Refresh token inválido ou expirado' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['auth'],
        summary: 'Logout — revoga todos os refresh tokens do usuário',
        security: bearerAuth,
        responses: {
          200: {
            description: 'Tokens revogados',
            content: { 'application/json': { schema: { type: 'object', properties: { revoked: { type: 'integer' } } } } },
          },
          401: { description: 'Não autenticado' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['auth'],
        summary: 'Dados do usuário autenticado',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          401: { description: 'Não autenticado' },
        },
      },
      put: {
        tags: ['auth'],
        summary: 'Atualiza perfil',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', nullable: true },
                  phone: { type: 'string', nullable: true },
                  pixType: { type: 'string', enum: ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'] },
                  pixKey: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          400: { description: 'Dados inválidos' },
        },
      },
    },
    '/auth/password': {
      put: {
        tags: ['auth'],
        summary: 'Troca senha',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', minLength: 8, maxLength: 120 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Senha trocada' },
          400: { description: 'Senha atual inválida ou nova senha fraca' },
          429: { description: 'Muitas trocas (rate limit: 5/hora)' },
        },
      },
    },

    // ─── HOME GAMES ──────────────────────────────────────────────────────────
    '/home-games': {
      post: {
        tags: ['homegame'],
        summary: 'Cria novo home game',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'address', 'dayOfWeek', 'startTime', 'chipValue'],
                properties: {
                  name: { type: 'string' },
                  gameType: { type: 'string', enum: ['CASH_GAME', 'TOURNAMENT'] },
                  address: { type: 'string' },
                  dayOfWeek: { type: 'string' },
                  startTime: { type: 'string' },
                  chipValue: moneyDecimal,
                  financialModule: { type: 'string', enum: ['POSTPAID', 'PREPAID', 'HYBRID'] },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/HomeGame' } } } },
        },
      },
    },
    '/home-games/mine/with-roles': {
      get: {
        tags: ['homegame'],
        summary: 'Home games do usuário autenticado separados por papel (owner/cohost/player)',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    asOwner: { type: 'array', items: { $ref: '#/components/schemas/HomeGame' } },
                    asCoHost: { type: 'array', items: { $ref: '#/components/schemas/HomeGame' } },
                    asPlayer: { type: 'array', items: { $ref: '#/components/schemas/HomeGame' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/home-games/join': {
      post: {
        tags: ['homegame'],
        summary: 'Entra em home game via joinCode (6 chars)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['joinCode'],
                properties: { joinCode: { type: 'string', minLength: 6, maxLength: 6 } },
              },
            },
          },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/HomeGame' } } } },
          404: { description: 'Código inválido' },
          409: { description: 'Usuário já é membro' },
        },
      },
    },
    '/home-games/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
      get: {
        tags: ['homegame'],
        summary: 'Detalhes de um home game',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/HomeGame' } } } },
          403: { description: 'Não é membro' },
          404: { description: 'Não encontrado' },
        },
      },
      delete: {
        tags: ['homegame'],
        summary: 'Deleta home game (apenas dono original)',
        responses: {
          200: { description: 'Deletado' },
          403: { description: 'Apenas o dono pode deletar' },
          429: { description: 'Rate limit: 20/hora' },
        },
      },
    },

    // ─── SESSIONS (cash game) ────────────────────────────────────────────────
    '/sessions': {
      post: {
        tags: ['session'],
        summary: 'Cria nova sessão',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['homeGameId'],
                properties: {
                  homeGameId: uuid,
                  chipValue: { type: 'number' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Criada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Session' } } } },
        },
      },
    },
    '/sessions/{id}/finish': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
      post: {
        tags: ['session'],
        summary: 'Finaliza sessão — calcula rake, caixinha, rakeback e cria ComandaItems',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  rake: { type: 'number' },
                  caixinha: { type: 'number' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Finalizada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Session' } } } },
          400: { description: 'Sessão não está ativa ou total de fichas em jogo não bate' },
        },
      },
    },
    '/sessions/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: uuid }],
      delete: {
        tags: ['session'],
        summary: 'Deleta sessão (destrutivo)',
        responses: {
          200: { description: 'Deletada' },
          429: { description: 'Rate limit: 20/hora' },
        },
      },
    },

    // ─── CASHIER ─────────────────────────────────────────────────────────────
    '/cashier/transaction': {
      post: {
        tags: ['cashier'],
        summary: 'Registra transação (buy-in, rebuy, addon, cashout, jackpot)',
        description:
          'Em home games PREPAID, a resposta pode conter `requiresCharge: true` com QR code PIX pra pagamento antes do buy-in ser efetivado.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'userId', 'type', 'amount', 'chips'],
                properties: {
                  sessionId: uuid,
                  userId: uuid,
                  type: { type: 'string', enum: ['BUYIN', 'REBUY', 'ADDON', 'CASHOUT', 'JACKPOT'] },
                  amount: { type: 'number', minimum: 0 },
                  chips: { type: 'integer', minimum: 0 },
                  note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Registrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/Transaction' } } } },
          400: { description: 'Sessão não ativa ou jogador já fez cashout' },
        },
      },
    },
    '/cashier/transactions': {
      get: {
        tags: ['cashier'],
        summary: 'Lista transações da sessão',
        parameters: [
          { name: 'sessionId', in: 'query', required: true, schema: uuid },
          { name: 'userId', in: 'query', schema: uuid, description: 'Filtra por jogador' },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } } } } },
        },
      },
    },
    '/cashier/transaction/{transactionId}': {
      parameters: [{ name: 'transactionId', in: 'path', required: true, schema: uuid }],
      delete: {
        tags: ['cashier'],
        summary: 'Deleta transação (destrutivo — audit log registrado)',
        responses: {
          200: { description: 'Deletada' },
          429: { description: 'Rate limit: 20/hora' },
        },
      },
    },

    // ─── COMANDA ─────────────────────────────────────────────────────────────
    '/comanda/{comandaId}': {
      parameters: [{ name: 'comandaId', in: 'path', required: true, schema: uuid }],
      get: {
        tags: ['comanda'],
        summary: 'Detalhes da comanda com itens e balanço',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/Comanda' },
                    {
                      type: 'object',
                      properties: { items: { type: 'array', items: { $ref: '#/components/schemas/ComandaItem' } } },
                    },
                  ],
                },
              },
            },
          },
          403: { description: 'Sem permissão (não é o player nem host)' },
        },
      },
    },
    '/comanda/{comandaId}/close': {
      parameters: [{ name: 'comandaId', in: 'path', required: true, schema: uuid }],
      post: {
        tags: ['comanda'],
        summary: 'Fecha comanda (só host/co-host)',
        responses: {
          200: { description: 'Fechada' },
          400: { description: 'Há pagamentos pendentes' },
        },
      },
    },
    '/comanda/{comandaId}/pix-charge': {
      parameters: [{ name: 'comandaId', in: 'path', required: true, schema: uuid }],
      post: {
        tags: ['comanda'],
        summary: 'Gera cobrança PIX via ANNAPAY pra saldo devedor',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount', 'kind'],
                properties: {
                  amount: { type: 'number' },
                  kind: { type: 'string', enum: ['SPOT', 'TERM'], description: 'SPOT=imediato, TERM=24h' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'QR code gerado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    qrCodeBase64: { type: 'string', nullable: true },
                    pixCopyPaste: { type: 'string', nullable: true },
                    item: { $ref: '#/components/schemas/ComandaItem' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/comanda/{comandaId}/pix-out': {
      parameters: [{ name: 'comandaId', in: 'path', required: true, schema: uuid }],
      post: {
        tags: ['comanda'],
        summary: 'Envia PIX pro jogador (credor na comanda)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount'],
                properties: { amount: { type: 'number' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'PIX enfileirado (processamento assíncrono)' },
          429: { description: 'Rate limit: 10/min por usuário' },
          503: { description: 'ANNAPAY fora do ar' },
        },
      },
    },

    // ─── TOURNAMENT ──────────────────────────────────────────────────────────
    '/tournaments': {
      post: {
        tags: ['tournament'],
        summary: 'Cria torneio',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['homeGameId', 'name', 'buyInAmount', 'startingChips'],
                properties: {
                  homeGameId: uuid,
                  name: { type: 'string' },
                  buyInAmount: { type: 'number' },
                  startingChips: { type: 'integer' },
                  rake: { type: 'number' },
                  rebuyAmount: { type: 'number' },
                  addonAmount: { type: 'number' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Tournament' } } } },
        },
      },
    },
    '/tournaments/{tournamentId}': {
      parameters: [{ name: 'tournamentId', in: 'path', required: true, schema: uuid }],
      get: {
        tags: ['tournament'],
        summary: 'Detalhes do torneio (inclui players, blind levels, breaks)',
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Tournament' } } } },
        },
      },
    },

    // ─── BANKING ─────────────────────────────────────────────────────────────
    '/banking/annapay/prepaid/settle': {
      post: {
        tags: ['banking'],
        summary: 'Confirma pagamento PIX prepaid e materializa transação (idempotente)',
        description:
          'Polling pelo frontend a cada 5s. UPDATE conditional atômico (PENDING → PROCESSING) como lock. Webhook concorrente → 1 settle só.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['chargeId'],
                properties: {
                  chargeId: { type: 'string' },
                  virtualAccount: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Resultado do settle',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    settled: { type: 'boolean' },
                    reason: { type: 'string' },
                    message: { type: 'string' },
                    sessionId: uuid,
                    transactionResult: { type: 'object' },
                  },
                },
              },
            },
          },
          429: { description: 'Rate limit: 60/min por usuário' },
        },
      },
    },
    '/banking/annapay/balance': {
      get: {
        tags: ['banking'],
        summary: 'Saldo da conta virtual ANNAPAY',
        parameters: [{ name: 'virtualAccount', in: 'query', schema: { type: 'string' } }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } },
          503: { description: 'ANNAPAY fora do ar' },
        },
      },
    },
  },
} as const
