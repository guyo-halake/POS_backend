import express from 'express';
import { initiateSTKPush, handleCallback } from '../payment/mpesaController.js';

const router = express.Router();

router.post('/stkpush', initiateSTKPush);
router.post('/callback', handleCallback);

export default router;
