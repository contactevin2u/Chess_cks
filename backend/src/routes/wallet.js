import { Router } from 'express';
import { getWallet, creditDemo, spend } from '../controllers/walletController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, getWallet);
router.post('/credit', requireAuth, creditDemo); // demo top-up (replace with Billplz)
router.post('/spend', requireAuth, spend);

export default router;
