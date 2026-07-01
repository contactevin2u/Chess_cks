import { Router } from 'express';
import { register, login, me, forgotPassword, resetPassword, requestOtp, verifyOtp, createGuest } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/guest', createGuest);           // anonymous session that can hold tokens
router.post('/register', register);           // (kept for compatibility)
router.post('/request-otp', requestOtp);      // sign-up step 1: email a code
router.post('/verify-otp', verifyOtp);        // sign-up step 2: verify + create
router.post('/login', login);
router.get('/me', requireAuth, me);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
