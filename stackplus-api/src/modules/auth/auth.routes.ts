import { Router } from 'express'
import * as AuthController from './auth.controller'
import { authenticate } from '../../middlewares/auth.middleware'
import { loginLimiter, registerLimiter } from '../../middlewares/rate-limit.middleware'

const router = Router()

router.post('/register', registerLimiter, AuthController.register)
router.post('/login', loginLimiter, AuthController.login)
router.post('/sangeur/login', loginLimiter, AuthController.loginSangeur)
router.get('/me', authenticate, AuthController.me)
router.put('/me', authenticate, AuthController.updateMe)
router.put('/password', authenticate, AuthController.changePassword)
router.put('/sangeur/password', authenticate, AuthController.changeSangeurPassword)

export default router
