import { Router } from 'express'
import authRoutes from '../modules/auth/auth.routes'
import usersRoutes from '../modules/users/users.routes'
import homeGameRoutes from '../modules/homegame/homegame.routes'
import sessionRoutes from '../modules/session/session.routes'
import cashierRoutes from '../modules/cashier/cashier.routes'
import rankingRoutes from '../modules/ranking/ranking.routes'
import groupsRoutes from '../modules/groups/groups.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/users', usersRoutes)
router.use('/home-games', homeGameRoutes)
router.use('/sessions', sessionRoutes)
router.use('/cashier', cashierRoutes)
router.use('/ranking', rankingRoutes)
router.use('/groups', groupsRoutes)

export default router
