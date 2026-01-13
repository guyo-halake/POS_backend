import express from 'express';
import { initiateSTKPush, handleCallback, checkStatus } from '../payment/mpesaController.js';

const router = express.Router();

router.post('/stkpush', initiateSTKPush);
router.post('/callback', handleCallback);
router.get('/status/:checkoutRequestId', checkStatus);

export default router;
