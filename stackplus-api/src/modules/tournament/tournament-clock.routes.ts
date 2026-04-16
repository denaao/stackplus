import { Router, Request, Response } from 'express'
import * as TournamentService from './tournament.service'

const router = Router()

// GET /tournament-clock/:id — public, no auth required
router.get('/:id', async (req: Request, res: Response) => {
  const tournament = await TournamentService.getTournament(req.params.id)
  res.json(tournament)
})

export default router
