import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { loginRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { changePasswordSchema, loginSchema } from './auth.schemas.js';

const router = Router();

router.post('/login', loginRateLimiter(), validate({ body: loginSchema }), controller.login);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.me);
router.post(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

export default router;
