import { Router } from 'express';
import {
  getPackages,
  createBillHandler,
  webhookHandler,
} from '../controllers/paymentController.js';

const router = Router();

router.get('/packages', getPackages);
router.post('/create-bill', createBillHandler);
router.post('/webhook', webhookHandler);

export default router;
