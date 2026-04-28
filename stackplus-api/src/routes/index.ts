import { Router } from 'express'
import authRoutes from '../modules/auth/auth.routes'
import usersRoutes from '../modules/users/users.routes'
import homeGameRoutes from '../modules/homegame/homegame.routes'
import sessionRoutes from '../modules/session/session.routes'
import cashierRoutes from '../modules/cashier/cashier.routes'
import rankingRoutes from '../modules/ranking/ranking.routes'
import groupsRoutes from '../modules/groups/groups.routes'
import annapayRoutes from '../modules/banking/annapay.routes'
import sangeurRoutes from '../modules/sangeur/sangeur.routes'
import comandaRoutes from '../modules/comanda/comanda.routes'
import tournamentRoutes from '../modules/tournament/tournament.routes'
import tournamentClockRoutes from '../modules/tournament/tournament-clock.routes'
import cashTableRoutes from '../modules/cash-table/cash-table.routes'
import eventRoutes from '../modules/event/event.routes'
import eventStaffRoutes from '../modules/event-staff/event-staff.routes'
import eventDailyCloseRoutes from '../modules/event-daily-close/event-daily-close.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use('/users', usersRoutes)
router.use('/home-games', homeGameRoutes)
router.use('/sessions', sessionRoutes)
router.use('/cashier', cashierRoutes)
router.use('/ranking', rankingRoutes)
router.use('/groups', groupsRoutes)
router.use('/banking/annapay', annapayRoutes)
router.use('/sangeur', sangeurRoutes)
router.use('/comanda', comandaRoutes)
router.use('/tournaments', tournamentRoutes)
router.use('/tournament-clock', tournamentClockRoutes)
router.use('/cash-tables', cashTableRoutes)
router.use('/events', eventRoutes)
router.use('/events/:eventId/staff', eventStaffRoutes)
router.use('/events/:eventId/daily-closes', eventDailyCloseRoutes)

export default router
