'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import { useAuthStore } from '@/store/useStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  id: string
  icon: string
  title: string
  color: string
  topics: Topic[]
}

interface Topic {
  title: string
  content: ContentBlock[]
}

type ContentBlock =
  | { type: 'p'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'note'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'tags'; items: { label: string; color: string }[] }

// ─── Conteudo ─────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  {
    id: 'cash',
    icon: '💵',
    title: 'Cash Game',
    color: '#00C8E0',
    topics: [
      {
        title: 'Criar uma Partida',
        content: [
          { type: 'p', text: 'No Home Game, clique em "Nova Partida" e selecione Cash Game. O assistente tem dois passos:' },
          { type: 'steps', items: [
            'Passo 1 — Escolha a variante de poker, módulo financeiro e se incluirá SANGEUR',
            'Passo 2 — Defina nome da partida, valor da ficha, blinds, buy-in mínimo, tempo mínimo, taxa de alimentação e jackpot (opcional)',
          ]},
          { type: 'note', text: 'A partida fica em status "Aguardando" até que você adicione participantes e inicie na tela de gerenciamento.' },
        ],
      },
      {
        title: 'Gerenciamento (antes de iniciar)',
        content: [
          { type: 'bullets', items: [
            'Selecione os participantes da partida (mínimo 2)',
            'Defina o Caixa responsável',
            'Atribua Staff e percentuais de Rakeback',
            'Configure a Caixinha (modo SPLIT ou INDIVIDUAL)',
            'Clique em "Iniciar Partida" para ativar',
          ]},
        ],
      },
      {
        title: 'Registrar Transações',
        content: [
          { type: 'p', text: 'O formulário detecta automaticamente o tipo de transação com base no histórico do jogador:' },
          { type: 'table',
            headers: ['Botão que aparece', 'Quando', 'O que faz'],
            rows: [
              ['Registrar Buy-in', 'Primeira entrada', 'Compra inicial de fichas'],
              ['Registrar Rebuy', 'Já entrou antes', 'Recompra de fichas'],
              ['Registrar Cashout', 'Qualquer momento', 'Converte fichas em dinheiro'],
              ['Registrar Jackpot', 'Jackpot habilitado', 'Distribui prêmio ao jogador'],
            ],
          },
          { type: 'note', text: 'Use o botão "+" para adicionar um jogador que ainda não entrou na partida.' },
        ],
      },
      {
        title: 'Mesas e Sangria',
        content: [
          { type: 'p', text: 'Uma partida pode ter múltiplas mesas abertas ao mesmo tempo. Em cada mesa você pode:' },
          { type: 'bullets', items: [
            'Sentar jogador — adiciona participante à mesa física',
            'Atualizar stack — registra as fichas atuais de cada jogador',
            'Fazer sangria — retira rake, caixinha e/ou jackpot para o caixa',
            'Sangria Final — fecha a mesa (exige cashout de todos os jogadores)',
          ]},
          { type: 'note', text: 'O sistema valida que a sangria não excede as fichas disponíveis na sessão.' },
        ],
      },
      {
        title: 'Encerrar Partida',
        content: [
          { type: 'p', text: 'O botão "Encerrar Partida" aparece somente quando:' },
          { type: 'bullets', items: [
            'Fichas em aberto = 0 (todos fizeram cashout ou as fichas foram cobertas por sangria)',
            'Não há nenhuma mesa com status ABERTA',
          ]},
          { type: 'p', text: 'O modal pré-popula automaticamente rake, caixinha e jackpot arrecadado com os valores das sangrias. Também mostra quem recebeu jackpot e calcula o novo saldo projetado.' },
        ],
      },
    ],
  },
  {
    id: 'tournament',
    icon: '🏆',
    title: 'Torneios',
    color: '#F59E0B',
    topics: [
      {
        title: 'Criar um Torneio',
        content: [
          { type: 'p', text: 'Acesse a aba "Torneios" no Home Game e clique em "Novo Torneio". Configure:' },
          { type: 'bullets', items: [
            'Buy-in, taxa (rake) e fichas iniciais',
            'Rebuy — valor, fichas e até qual nível está disponível',
            'Add-on — disponível após determinado nível',
            'Bounty — pago a quem eliminar outro jogador',
            'Double buy-in com bônus de fichas',
            'Late registration até o nível X',
          ]},
        ],
      },
      {
        title: 'Estrutura de Blinds',
        content: [
          { type: 'p', text: 'Defina os níveis com small blind, big blind e ante. Configure também:' },
          { type: 'bullets', items: [
            'Minutos por nível (antes e depois do late registration)',
            'Breaks — intervalos na estrutura de blinds',
          ]},
        ],
      },
      {
        title: 'Durante o Torneio',
        content: [
          { type: 'bullets', items: [
            'Start / Pause / Resume — controla o relógio',
            'Break — pausa para intervalo entre níveis',
            'Inscrever jogador — registra na comanda automaticamente',
            'Registrar rebuy e add-on no momento correto',
            'Eliminar jogador — registra posição e quem eliminou (bounty)',
            'Deal de prêmios — distribui o prize pool entre sobreviventes',
            'Encerrar torneio — finaliza e gera o relatório',
          ]},
          { type: 'note', text: 'Acesse /tournament/[id]/clock para uma tela dedicada ao relógio — ideal para projetar em TV.' },
        ],
      },
    ],
  },
  {
    id: 'comanda',
    icon: '💲',
    title: 'Comandas',
    color: '#22C55E',
    topics: [
      {
        title: 'O que é uma Comanda',
        content: [
          { type: 'p', text: 'A comanda é a ficha financeira individual de cada jogador. Registra todos os débitos e créditos e calcula o saldo em aberto.' },
          { type: 'table',
            headers: ['Lançamento', 'Efeito na comanda'],
            rows: [
              ['Buy-in / Rebuy / Add-on', 'DÉBITO — jogador deve'],
              ['Cashout', 'CRÉDITO — host deve ao jogador'],
              ['Pagamento (PIX, dinheiro, cartão)', 'CRÉDITO — quita a dívida'],
              ['Caixinha / Rakeback (staff)', 'CRÉDITO na comanda do staff'],
            ],
          },
        ],
      },
      {
        title: 'Modos de Pagamento',
        content: [
          { type: 'tags', items: [
            { label: 'Pós-pago', color: '#00C8E0' },
            { label: 'Pré-pago', color: '#F59E0B' },
            { label: 'Híbrido', color: '#A78BFA' },
          ]},
          { type: 'bullets', items: [
            'Pós-pago — jogador acumula débito e paga ao final',
            'Pré-pago — carrega crédito antes e sistema bloqueia se insuficiente',
            'Híbrido — permite os dois modos por jogador',
          ]},
        ],
      },
      {
        title: 'Gerenciar Comandas',
        content: [
          { type: 'bullets', items: [
            'Filtre por status: Abertas / Fechadas / Todas',
            'Filtre por saldo: Com crédito / Em débito',
            'Busque por nome do jogador',
            'Clique em um jogador para abrir a comanda individual',
          ]},
        ],
      },
      {
        title: 'Fechar uma Comanda',
        content: [
          { type: 'p', text: 'Uma comanda só pode ser fechada quando:' },
          { type: 'bullets', items: [
            'Saldo = R$ 0,00',
            'Jogador não tem seat ativo em mesa aberta',
          ]},
          { type: 'note', text: 'Se o jogador teve fichas retiradas por sangria (sem cashout explícito), a comanda pode ser fechada normalmente assim que todas as mesas estiverem fechadas.' },
        ],
      },
    ],
  },
  {
    id: 'caixa',
    icon: '📊',
    title: 'Caixa do Dia',
    color: '#A78BFA',
    topics: [
      {
        title: 'O que é o Caixa do Dia',
        content: [
          { type: 'p', text: 'Relatório financeiro consolidado com todas as movimentações do Home Game em um período. Acesse pelo botão "Caixa do Dia" na página de Comandas.' },
        ],
      },
      {
        title: 'Filtro de Período',
        content: [
          { type: 'bullets', items: [
            'Data específica — selecione qualquer dia no calendário',
            'Hoje — atalho para o dia atual (padrão)',
            'Todo o histórico — consolida tudo desde o início',
            'Atualizar — rebusca os dados com os filtros selecionados',
          ]},
        ],
      },
      {
        title: 'O que o Relatório Mostra',
        content: [
          { type: 'p', text: 'Quatro cards de resumo aparecem no topo:' },
          { type: 'bullets', items: [
            'Entradas — total de créditos (pagamentos, cashouts, caixinha)',
            'Saídas — total de débitos (buy-ins, rebuys, taxas)',
            'Saldo Líquido — entradas menos saídas',
            'PIX Pendente — PIX enviados ainda não confirmados',
          ]},
          { type: 'p', text: 'Abaixo, cada categoria tem uma linha expansível. Clique para ver o detalhamento por jogador:' },
          { type: 'table',
            headers: ['Categoria', 'Detalhe ao expandir'],
            rows: [
              ['💵 Dinheiro recebido', 'Por jogador'],
              ['📱 PIX recebido', 'Por jogador'],
              ['💳 Cartão recebido', 'Por jogador'],
              ['↗ PIX enviado', 'Por jogador (cashouts)'],
              ['🃏 Rake / Caixinha / Rakeback', 'Total do período'],
              ['📈 Total entradas por jogador', 'Consolidado'],
              ['📉 Total saídas por jogador', 'Consolidado'],
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'sangeur',
    icon: '🏧',
    title: 'SANGEUR',
    color: '#F87171',
    topics: [
      {
        title: 'O que é o SANGEUR',
        content: [
          { type: 'p', text: 'Módulo de caixa móvel com login próprio e acesso restrito. O operador SANGEUR vende fichas e registra pagamentos durante a partida, sem acesso ao painel do host.' },
        ],
      },
      {
        title: 'Habilitar o SANGEUR',
        content: [
          { type: 'steps', items: [
            'No Home Game, acesse a aba SANGEUR',
            'Informe o nome do operador e um username',
            'Um QR Code de ativação é gerado — compartilhe com o operador',
            'O operador acessa /sangeur/ativar e cria sua senha no primeiro acesso',
          ]},
          { type: 'note', text: 'O login do SANGEUR é feito em /sangeur/login — separado do login dos jogadores.' },
        ],
      },
      {
        title: 'Operação do Caixa Móvel',
        content: [
          { type: 'bullets', items: [
            'Selecionar sessão ativa e jogador',
            'Registrar venda com valor, fichas e forma de pagamento (PIX QR, Voucher, Dinheiro, Cartão)',
            'Abrir turno — carrega fichas iniciais no caixa móvel',
            'Fechar turno — devolve fichas não vendidas e encerra o turno',
          ]},
          { type: 'note', text: 'Vendas do SANGEUR aparecem no cashier com a badge "SANGEUR" (não "CAIXA").' },
        ],
      },
    ],
  },
]

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderBlock(block: ContentBlock, idx: number) {
  switch (block.type) {
    case 'p':
      return (
        <p key={idx} style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.7, marginBottom: '10px' }}>
          {block.text}
        </p>
      )
    case 'bullets':
      return (
        <ul key={idx} style={{ marginBottom: '10px', paddingLeft: 0, listStyle: 'none' }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6 }}>
              <span style={{ color: '#00C8E0', flexShrink: 0, marginTop: '2px' }}>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case 'steps':
      return (
        <ol key={idx} style={{ marginBottom: '10px', paddingLeft: 0, listStyle: 'none' }}>
          {block.items.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px', fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6, alignItems: 'flex-start' }}>
              <span style={{
                minWidth: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,200,224,0.15)',
                border: '1px solid rgba(0,200,224,0.4)', color: '#00C8E0', fontSize: '11px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px',
              }}>{i + 1}</span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      )
    case 'note':
      return (
        <div key={idx} style={{
          borderLeft: '3px solid rgba(0,200,224,0.5)', paddingLeft: '12px', marginBottom: '10px',
          background: 'rgba(0,200,224,0.05)', borderRadius: '0 6px 6px 0', padding: '10px 12px',
        }}>
          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
            💡 {block.text}
          </p>
        </div>
      )
    case 'table':
      return (
        <div key={idx} style={{ overflowX: 'auto', marginBottom: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} style={{
                    padding: '8px 12px', textAlign: 'left', background: 'rgba(0,200,224,0.1)',
                    color: '#00C8E0', fontWeight: 700, borderBottom: '1px solid rgba(0,200,224,0.2)',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} style={{
                      padding: '8px 12px', color: ci === 0 ? '#e2e8f0' : '#94a3b8',
                      fontWeight: ci === 0 ? 600 : 400, borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'tags':
      return (
        <div key={idx} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {block.items.map((tag, i) => (
            <span key={i} style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
              background: `${tag.color}22`, border: `1px solid ${tag.color}55`, color: tag.color,
            }}>{tag.label}</span>
          ))}
        </div>
      )
    default:
      return null
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManualPage() {
  const router = useRouter()
  const params = useParams()
  const { user, logout } = useAuthStore()
  const id = params.id as string

  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id)
  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>({})

  const section = SECTIONS.find(s => s.id === activeSection) ?? SECTIONS[0]

  function toggleTopic(key: string) {
    setOpenTopics(prev => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050D15', color: '#fff' }}>
      <AppHeader
        module="Home Game"
        title="Manual de Uso"
        onBack={() => router.push(`/homegame/${id}/select`)}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />

      <main style={{ maxWidth: '768px', margin: '0 auto', padding: '16px 16px 64px' }}>

        {/* Intro */}
        <div style={{
          background: 'linear-gradient(135deg,#0C2438 0%,#071828 100%)',
          border: '1px solid rgba(0,200,224,0.15)',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '20px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '28px', margin: '0 0 8px' }}>📖</p>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Manual do StackPlus</h1>
          <p style={{ fontSize: '13px', color: '#4A7A90', margin: 0 }}>
            Guia completo de operação. Selecione um módulo abaixo para ver as instruções.
          </p>
        </div>

        {/* Nav de seções */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '8px',
          marginBottom: '20px',
        }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setActiveSection(s.id); setOpenTopics({}) }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                padding: '10px 4px', borderRadius: '12px', cursor: 'pointer', border: 'none',
                background: activeSection === s.id
                  ? `linear-gradient(135deg,${s.color}22,${s.color}11)`
                  : 'rgba(255,255,255,0.04)',
                outline: activeSection === s.id ? `1.5px solid ${s.color}55` : '1.5px solid rgba(255,255,255,0.08)',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '20px', lineHeight: 1 }}>{s.icon}</span>
              <span style={{
                fontSize: '10px', fontWeight: 700, textAlign: 'center', lineHeight: 1.2,
                color: activeSection === s.id ? s.color : '#4A7A90',
                letterSpacing: '0.02em',
              }}>{s.title}</span>
            </button>
          ))}
        </div>

        {/* Conteudo da seção */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {section.topics.map((topic, ti) => {
            const key = `${section.id}-${ti}`
            const isOpen = !!openTopics[key]
            return (
              <div
                key={key}
                style={{
                  background: 'linear-gradient(135deg,#0C2438 0%,#071828 100%)',
                  border: `1px solid ${isOpen ? section.color + '44' : 'rgba(0,200,224,0.1)'}`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Header do tópico */}
                <button
                  type="button"
                  onClick={() => toggleTopic(key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
                      background: `${section.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 700, color: section.color,
                    }}>{ti + 1}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>
                      {topic.title}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '11px', color: section.color,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s', lineHeight: 1, flexShrink: 0, marginLeft: '8px',
                  }}>▼</span>
                </button>

                {/* Conteúdo expandido */}
                {isOpen && (
                  <div style={{
                    padding: '0 16px 16px',
                    borderTop: `1px solid ${section.color}22`,
                    paddingTop: '14px',
                  }}>
                    {topic.content.map((block, bi) => renderBlock(block, bi))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: '32px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#1A3A50' }}>stackplus.com.br</p>
        </div>

      </main>
    </div>
  )
}
