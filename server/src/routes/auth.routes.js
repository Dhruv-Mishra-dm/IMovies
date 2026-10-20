import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { registerBody, loginBody, updateProfileBody, changePasswordBody } from '../validators/auth.js';

export function authRoutes({ limits }) {
  const router = Router();

  router.post('/register', limits.register, validate({ body: registerBody }), auth.register);
  router.post('/login', limits.login, validate({ body: loginBody }), auth.login);
  router.post('/refresh', limits.refresh, auth.refresh);
  router.post('/logout', auth.logout); // works even with an expired access token
  router.post('/logout-all', authenticate, auth.logoutAll);
  router.get('/me', authenticate, auth.me);
  router.patch('/me', authenticate, validate({ body: updateProfileBody }), auth.updateMe);
  router.post('/change-password', authenticate, limits.login, validate({ body: changePasswordBody }), auth.changePassword);

  return router;
}
