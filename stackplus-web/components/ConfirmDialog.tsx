'use client'

import { useState, useCallback } from 'react'

interface DialogState {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (value: boolean) => void
}

interface AlertState {
  title?: string
  message: string
  resolve: () => void
}

// ─── ConfirmModal ────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4"
      style={{ background: 'rgba(5,13,21,0.85)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{
          background: '#0C1F2E',
          border: '1px solid rgba(0,200,224,0.15)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {title && (
          <h3 className="text-base font-bold text-white">{title}</h3>
        )}
        <p className="text-sm text-zinc-300 leading-relaxed">{message}</p>
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={onConfirm}
            className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-opacity hover:opacity-90"
            style={{
              background: danger
                ? 'linear-gradient(135deg,#7f1d1d,#450a0a)'
                : 'linear-gradient(135deg,#00C8E0,#0099AD)',
              color: danger ? '#fca5a5' : '#050D15',
              border: danger ? '1px solid rgba(248,113,113,0.3)' : 'none',
            }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-xl text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AlertModal ──────────────────────────────────────────────────────────────

interface AlertModalProps {
  title?: string
  message: string
  label?: string
  onClose: () => void
}

export function AlertModal({ title, message, label = 'OK', onClose }: AlertModalProps) {
  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center p-4"
      style={{ background: 'rgba(5,13,21,0.85)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{
          background: '#0C1F2E',
          border: '1px solid rgba(0,200,224,0.15)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {title && (
          <h3 className="text-base font-bold text-white">{title}</h3>
        )}
        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line">{message}</p>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#00C8E0,#0099AD)', color: '#050D15' }}
        >
          {label}
        </button>
      </div>
    </div>
  )
}

// ─── useConfirm hook ─────────────────────────────────────────────────────────

export function useConfirm() {
  const [state, setState] = useState<DialogState | null>(null)

  const confirm = useCallback((
    message: string,
    options?: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
  ): Promise<boolean> =>
    new Promise(resolve =>
      setState({ message, ...options, resolve })
    ),
  [])

  const dialog = state ? (
    <ConfirmModal
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={() => { state.resolve(true); setState(null) }}
      onCancel={() => { state.resolve(false); setState(null) }}
    />
  ) : null

  return { confirm, dialog }
}

// ─── useAlert hook ───────────────────────────────────────────────────────────

export function useAlert() {
  const [state, setState] = useState<AlertState | null>(null)

  const alert = useCallback((
    message: string,
    options?: { title?: string; label?: string }
  ): Promise<void> =>
    new Promise(resolve =>
      setState({ message, ...options, resolve })
    ),
  [])

  const dialog = state ? (
    <AlertModal
      title={state.title}
      message={state.message}
      onClose={() => { state.resolve(); setState(null) }}
    />
  ) : null

  return { alert, dialog }
}
