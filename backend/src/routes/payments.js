import { Router } from 'express';
import {
  getPackages,
  createBillHandler,
  webhookHandler,
} from '../controllers/paymentController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/packages', getPackages);
router.post('/create-bill', requireAuth, createBillHandler); // guest or real account
router.post('/webhook', webhookHandler);

export default router;
