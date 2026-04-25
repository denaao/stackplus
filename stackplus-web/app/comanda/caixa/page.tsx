'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/services/api'
import AppHeader from '@/components/AppHeader'
import HomeGameTabs from '@/components/HomeGameTabs'
import { useAuthStore } from '@/store/useStore'
import { useHomeGameRole } from '@/hooks/useHomeGameRole'
import { getErrorMessage } from '@/lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerAmount { playerId: string; name: string; amount: number }

interface CashboxReport {
  generatedAt: string
  periodStart: string | null
  periodEnd: string | null
  totals: {
    totalDebits: number
    totalCredits: number
    totalCash: number
    totalPixIn: number
    totalPixOut: number
    totalRake: number
    totalCaixinha: number
    totalRakeback: number
    totalPendingPix: number
  }
  comandasClosed: number
  comandasStillOpen: number
  openBalancesTotal: number
  playersWithDebt: number
  playersWithCredit: number
  sessionsCount: number
  tournamentsCount: number
  paymentsByType: Record<string, number>
  cashByPlayer: PlayerAmount[]
  cardByPlayer: PlayerAmount[]
  pixInByPlayer: PlayerAmount[]
  pixOutByPlayer: PlayerAmount[]
  creditsByPlayer: PlayerAmount[]
  debitsByPlayer: PlayerAmount[]
  openComandas: Array<{ id: string; playerId: string; playerName: string; balance: number; openedAt: string }>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  const abs = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  return n < 0 ? `- R$ ${abs}` : `R$ ${abs}`
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function startOfDay(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`
}

function endOfDay(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`
}

// ─── Accordion row ────────────────────────────────────────────────────────────

interface AccordionRowProps {
  label: string
  value: number
  valueColor?: string
  lines: PlayerAmount[]
  linesLabel?: string
  open: boolean
  onToggle: () => void
  emptyMsg?: string
}

function AccordionRow({
  label, value, valueColor = '#ffffff', lines, linesLabel, open, onToggle, emptyMsg
}: AccordionRowProps) {
  const hasLines = lines.length > 0
  return (
    <div style={{
      background: 'linear-gradient(135deg,#0C2438 0%,#071828 100%)',
      border: `1px solid ${open ? 'rgba(0,200,224,0.3)' : 'rgba(0,200,224,0.1)'}`,
      borderRadius: '12px',
      overflow: 'hidden',
      transition: 'border-color 0.15s',
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', background: 'none', border: 'none', cursor: hasLines ? 'pointer' : 'default',
          color: '#fff', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: valueColor, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(value)}
          </span>
          {hasLines && (
            <span style={{
              fontSize: '10px', color: '#4A7A90', transform: open ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.2s', lineHeight: 1,
            }}>▼</span>
          )}
        </div>
      </button>

      {open && hasLines && (
        <div style={{ borderTop: '1px solid rgba(0,200,224,0.08)' }}>
          {linesLabel && (
            <div style={{ padding: '8px 16px 4px', fontSize: '10px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {linesLabel}
            </div>
          )}
          {lines.map((l, i) => (
            <div
              key={l.playerId + i}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '9px 16px',
                background: i % 2 === 0 ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.08)',
                borderBottom: i < lines.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}
            >
              <span style={{ fontSize: '13px', color: '#cbd5e1' }}>{l.name}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: valueColor, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(l.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {open && !hasLines && (
        <div style={{ borderTop: '1px solid rgba(0,200,224,0.08)', padding: '12px 16px', fontSize: '13px', color: '#4A7A90' }}>
          {emptyMsg ?? 'Nenhum lançamento no período.'}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaixaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-sx-bg" />}>
      <CaixaContent />
    </Suspense>
  )
}

function CaixaContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const homeGameId = searchParams.get('homeGameId') ?? ''
  const { user, logout } = useAuthStore()
  const { canManage, loading: roleLoading } = useHomeGameRole(homeGameId)

  const [date, setDate] = useState(todayISO())
  const [allTime, setAllTime] = useState(false)
  const [report, setReport] = useState<CashboxReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const toggle = (key: string) => setOpen(prev => ({ ...prev, [key]: !prev[key] }))

  const fetchReport = useCallback(async () => {
    if (!homeGameId || roleLoading || !canManage) return
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, string> = { homeGameId }
      if (!allTime) {
        body.from = startOfDay(date)
        body.to = endOfDay(date)
      }
      const { data } = await api.post('/comanda/cashbox/close', body)
      setReport(data)
      setOpen({})
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao gerar relatório'))
    } finally {
      setLoading(false)
    }
  }, [homeGameId, date, allTime, canManage, roleLoading])

  useEffect(() => {
    if (!roleLoading && canManage) fetchReport()
  }, [fetchReport, roleLoading, canManage])

  if (homeGameId && !roleLoading && !canManage) {
    return (
      <div className="min-h-screen bg-sx-bg text-white">
        <AppHeader title="Caixa do Dia" onBack={() => router.back()} userName={user?.name} onLogout={() => { logout(); router.push('/') }} />
        <main className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <p className="text-sx-muted">Área restrita ao host.</p>
        </main>
      </div>
    )
  }

  const t = report?.totals

  // Monta lista de rakeback e rake sem detalhamento por jogador (API não retorna)
  const rakeLines: PlayerAmount[] = []
  const caixinhaLines: PlayerAmount[] = []
  const rakebackLines: PlayerAmount[] = []

  return (
    <div className="min-h-screen bg-sx-bg text-white">
      <AppHeader
        title="Caixa do Dia"
        onBack={() => router.back()}
        userName={user?.name}
        onLogout={() => { logout(); router.push('/') }}
      />
      {homeGameId && <HomeGameTabs homeGameId={homeGameId} active="COMANDAS" />}

      <main style={{ maxWidth: '768px', margin: '0 auto', padding: '20px 16px 48px' }}>

        {/* ── Filtro de data ─────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg,#0C2438 0%,#071828 100%)',
          border: '1px solid rgba(0,200,224,0.15)',
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1, minWidth: '160px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
              Data
            </label>
            <input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value); setAllTime(false) }}
              disabled={allTime}
              style={{
                width: '100%', background: '#0A1F30', border: '1px solid rgba(0,200,224,0.2)',
                borderRadius: '8px', padding: '8px 12px', fontSize: '14px', color: allTime ? '#4A7A90' : '#fff',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { setDate(todayISO()); setAllTime(false) }}
              style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: !allTime && date === todayISO() ? 'rgba(0,200,224,0.15)' : 'rgba(255,255,255,0.05)',
                border: !allTime && date === todayISO() ? '1px solid rgba(0,200,224,0.4)' : '1px solid rgba(255,255,255,0.1)',
                color: !allTime && date === todayISO() ? '#00C8E0' : '#94a3b8',
              }}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setAllTime(v => !v)}
              style={{
                padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                background: allTime ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                border: allTime ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.1)',
                color: allTime ? '#fbbf24' : '#94a3b8',
              }}
            >
              Todo histórico
            </button>
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              style={{
                padding: '8px 18px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                background: 'rgba(0,200,224,0.15)', border: '1px solid rgba(0,200,224,0.4)', color: '#00C8E0',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Carregando…' : 'Atualizar'}
            </button>
          </div>
        </div>

        {/* ── Erro ───────────────────────────────────────────────────────── */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        {/* ── Loading skeleton ───────────────────────────────────────────── */}
        {loading && !report && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <div style={{ width: '28px', height: '28px', border: '3px solid rgba(0,200,224,0.3)', borderTopColor: '#00C8E0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* ── Relatório ──────────────────────────────────────────────────── */}
        {report && t && (
          <>
            {/* Período */}
            <p style={{ fontSize: '11px', color: '#4A7A90', marginBottom: '16px', textAlign: 'right' }}>
              {allTime ? 'Todo o histórico' : `Período: ${new Date(startOfDay(date)).toLocaleDateString('pt-BR')} · 00:00 – 23:59`}
              {' · '}Gerado {new Date(report.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>

            {/* Cartões de resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '24px' }}>
              {[
                { label: 'Entradas', value: t.totalCredits, color: '#4ade80' },
                { label: 'Saídas', value: t.totalDebits, color: '#f87171' },
                { label: 'Saldo líquido', value: t.totalCredits - t.totalDebits, color: (t.totalCredits - t.totalDebits) >= 0 ? '#4ade80' : '#f87171' },
                { label: 'PIX pendente', value: t.totalPendingPix, color: '#fbbf24' },
              ].map(card => (
                <div key={card.label} style={{
                  background: 'linear-gradient(135deg,#0C2438 0%,#071828 100%)',
                  border: '1px solid rgba(0,200,224,0.1)', borderRadius: '12px', padding: '14px 16px',
                }}>
                  <div style={{ fontSize: '11px', color: '#4A7A90', marginBottom: '4px' }}>{card.label}</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: card.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(card.value)}</div>
                </div>
              ))}
            </div>

            {/* Sessões / Torneios / Comandas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '24px' }}>
              {[
                { label: 'Sessões cash', value: report.sessionsCount },
                { label: 'Torneios', value: report.tournamentsCount },
                { label: 'Coman. fechadas', value: report.comandasClosed },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: 'linear-gradient(135deg,#0C2438 0%,#071828 100%)',
                  border: '1px solid rgba(0,200,224,0.08)', borderRadius: '12px', padding: '12px 14px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '10px', color: '#4A7A90', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</div>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Divider */}
            <p style={{ fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
              Detalhamento — clique para expandir
            </p>

            {/* Acordeões */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

              <AccordionRow
                label="💵 Dinheiro recebido"
                value={t.totalCash}
                valueColor="#4ade80"
                lines={report.cashByPlayer}
                linesLabel="por jogador"
                open={!!open['cash']}
                onToggle={() => toggle('cash')}
              />

              <AccordionRow
                label="📱 PIX recebido"
                value={t.totalPixIn}
                valueColor="#00C8E0"
                lines={report.pixInByPlayer}
                linesLabel="por jogador"
                open={!!open['pixIn']}
                onToggle={() => toggle('pixIn')}
              />

              {(report.paymentsByType['PAYMENT_CARD'] ?? 0) > 0 && (
                <AccordionRow
                  label="💳 Cartão recebido"
                  value={report.paymentsByType['PAYMENT_CARD'] ?? 0}
                  valueColor="#a78bfa"
                  lines={report.cardByPlayer}
                  linesLabel="por jogador"
                  open={!!open['card']}
                  onToggle={() => toggle('card')}
                />
              )}

              {t.totalPixOut > 0 && (
                <AccordionRow
                  label="↗ PIX enviado (cashout)"
                  value={t.totalPixOut}
                  valueColor="#f87171"
                  lines={report.pixOutByPlayer}
                  linesLabel="por jogador"
                  open={!!open['pixOut']}
                  onToggle={() => toggle('pixOut')}
                />
              )}

              <AccordionRow
                label="🃏 Rake arrecadado"
                value={t.totalRake}
                valueColor="#fbbf24"
                lines={rakeLines}
                open={!!open['rake']}
                onToggle={() => toggle('rake')}
                emptyMsg="Detalhamento por partida não disponível neste relatório."
              />

              <AccordionRow
                label="🏦 Caixinha arrecadada"
                value={t.totalCaixinha}
                valueColor="#fbbf24"
                lines={caixinhaLines}
                open={!!open['caixinha']}
                onToggle={() => toggle('caixinha')}
                emptyMsg="Detalhamento por partida não disponível neste relatório."
              />

              {t.totalRakeback > 0 && (
                <AccordionRow
                  label="🔁 Rakeback distribuído"
                  value={t.totalRakeback}
                  valueColor="#f87171"
                  lines={rakebackLines}
                  open={!!open['rakeback']}
                  onToggle={() => toggle('rakeback')}
                  emptyMsg="Detalhamento por partida não disponível neste relatório."
                />
              )}

              {t.totalPendingPix > 0 && (
                <AccordionRow
                  label="⏳ PIX pendente (não confirmado)"
                  value={t.totalPendingPix}
                  valueColor="#fbbf24"
                  lines={[]}
                  open={!!open['pendingPix']}
                  onToggle={() => toggle('pendingPix')}
                  emptyMsg="Detalhamento não disponível. Verifique os PIX pendentes nas comandas."
                />
              )}

              {/* Entradas por jogador */}
              <AccordionRow
                label="📈 Total entradas por jogador"
                value={t.totalCredits}
                valueColor="#4ade80"
                lines={report.creditsByPlayer}
                linesLabel="entradas consolidadas"
                open={!!open['credits']}
                onToggle={() => toggle('credits')}
              />

              {/* Saídas por jogador */}
              <AccordionRow
                label="📉 Total saídas por jogador"
                value={t.totalDebits}
                valueColor="#f87171"
                lines={report.debitsByPlayer}
                linesLabel="saídas consolidadas"
                open={!!open['debits']}
                onToggle={() => toggle('debits')}
              />

            </div>

            {/* Comandas em aberto */}
            {report.openComandas.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <p style={{ fontSize: '11px', color: '#4A7A90', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
                  Comandas em aberto ({report.openComandas.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {report.openComandas.map(c => (
                    <div
                      key={c.id}
                      style={{
                        background: 'linear-gradient(135deg,#0C2438 0%,#071828 100%)',
                        border: '1px solid rgba(0,200,224,0.1)', borderRadius: '10px',
                        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>{c.playerName}</div>
                        <div style={{ fontSize: '12px', color: c.balance < 0 ? '#f87171' : c.balance > 0 ? '#4ade80' : '#4A7A90', marginTop: '2px' }}>
                          Saldo: {fmt(c.balance)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/comanda/${c.id}`)}
                        style={{
                          padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                          background: 'rgba(0,200,224,0.1)', border: '1px solid rgba(0,200,224,0.3)', color: '#00C8E0',
                        }}
                      >
                        Abrir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
