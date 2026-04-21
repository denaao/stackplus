'use client'

import { useEffect, useState } from 'react'
import api from '@/services/api'
import { useAuthStore } from '@/store/useStore'

export type HomeGameRole = 'OWNER' | 'COHOST' | 'PLAYER' | null

interface HomeGameRoleResult {
  /** Papel do usuário no home game específico (OWNER/COHOST/PLAYER/null). */
  role: HomeGameRole
  /** True enquanto o fetch está em andamento. */
  loading: boolean
  /** True se o usuário tem permissão gerencial (OWNER, COHOST ou ADMIN global). */
  canManage: boolean
  /** True se o usuário é ADMIN global — bypass de checks por home game. */
  isAdmin: boolean
}

/**
 * Resolve o papel do usuário logado dentro de um home game específico.
 *
 * Usa o endpoint /home-games/mine/with-roles que retorna as listas
 * asOwner/asCoHost/asPlayer. Intersecta com o homeGameId pedido.
 *
 * Usuários ADMIN globais tem canManage=true independente do papel no HG.
 */
export function useHomeGameRole(homeGameId: string | null | undefined): HomeGameRoleResult {
  const [role, setRole] = useState<HomeGameRole>(null)
  const [loading, setLoading] = useState<boolean>(Boolean(homeGameId))
  const { user } = useAuthStore()

  useEffect(() => {
    if (!homeGameId) {
      setRole(null)
      setLoading(false)
      return
    }
    setLoading(true)
    api
      .get('/home-games/mine/with-roles')
      .then((r) => {
        const d = r.data
        const matches = (arr: unknown) =>
          Array.isArray(arr) && arr.some((g: { id: string }) => g.id === homeGameId)
        if (matches(d.asOwner)) setRole('OWNER')
        else if (matches(d.asCoHost)) setRole('COHOST')
        else if (matches(d.asPlayer)) setRole('PLAYER')
        else setRole(null)
      })
      .catch(() => setRole(null))
      .finally(() => setLoading(false))
  }, [homeGameId])

  const isAdmin = user?.role === 'ADMIN'
  const canManage = isAdmin || role === 'OWNER' || role === 'COHOST'

  return { role, loading, canManage, isAdmin }
}
