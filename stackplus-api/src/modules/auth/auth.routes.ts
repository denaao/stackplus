import { Router } from 'express'
import * as AuthController from './auth.controller'
import { authenticate } from '../../middlewares/auth.middleware'

const router = Router()

router.post('/register', AuthController.register)
router.post('/login', AuthController.login)
router.post('/sangeur/login', AuthController.loginSangeur)
router.get('/me', authenticate, AuthController.me)
router.put('/me', authenticate, AuthController.updateMe)
router.put('/password', authenticate, AuthController.changePassword)
router.put('/sangeur/password', authenticate, AuthController.changeSangeurPassword)

export default router
