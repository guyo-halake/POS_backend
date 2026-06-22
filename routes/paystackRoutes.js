import express from 'express';
import pool from '../database/db.js';

const router = express.Router();

async function getPaystackKey(req) {
    const businessId = req.headers['x-business-id'] || '11111111-1111-1111-1111-111111111111';
    try {
        const [rows] = await pool.query('SELECT payment_config FROM businesses WHERE id = ?', [businessId]);
        if (rows.length > 0 && rows[0].payment_config) {
            const config = JSON.parse(rows[0].payment_config);
            if (config.paystack?.enabled && config.paystack?.secretKey) {
                return config.paystack.secretKey;
            }
        }
    } catch (e) {
        console.error('Failed to get multi-tenant paystack key:', e);
    }
    return process.env.PAYSTACK_SECRET_KEY;
}

router.post('/charge', async (req, res) => {
    try {
        const { phone, amount, email = 'pos@rosemarypos.com' } = req.body;
        let normalizedPhone = phone.replace(/[^0-9]/g, '');
        if (normalizedPhone.startsWith('0')) {
            normalizedPhone = '+254' + normalizedPhone.slice(1);
        } else if (normalizedPhone.length === 9 && !normalizedPhone.startsWith('254')) {
            normalizedPhone = '+254' + normalizedPhone;
        } else if (normalizedPhone.startsWith('254')) {
            normalizedPhone = '+' + normalizedPhone;
        }

        console.log(`[PAYSTACK] Original Phone: ${phone} | Normalized (Sending): ${normalizedPhone}`);

        const secretKey = await getPaystackKey(req);
        if (!secretKey) throw new Error("Paystack Secret Key is missing or not configured for this business.");

        const response = await fetch('https://api.paystack.co/charge', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${secretKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email,
                amount: parseInt(amount), // Lowest denomination (e.g., cents)
                currency: 'KES',
                mobile_money: {
                    phone: normalizedPhone,
                    provider: 'mpesa'
                }
            })
        });

        const data = await response.json();
        console.log(`[PAYSTACK RESPONSE]:\n${JSON.stringify(data, null, 2)}`);
        res.json(data);
    } catch (error) {
        console.error('Paystack Charge Error:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

router.get('/verify/:reference', async (req, res) => {
    try {
        const { reference } = req.params;
        
        const secretKey = await getPaystackKey(req);
        if (!secretKey) throw new Error("Paystack Secret Key is missing or not configured for this business.");

        const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${secretKey}`
            }
        });

        const data = await response.json();
        console.log(`[PAYSTACK VERIFY RESPONSE]:\n${JSON.stringify(data, null, 2)}`);
        res.json(data);
    } catch (error) {
        console.error('Paystack Verify Error:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

router.get('/balance', async (req, res) => {
    try {
        const authHeader = { 'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}` };
        
        const response = await fetch('https://api.paystack.co/balance', {
            method: 'GET',
            headers: authHeader
        });
        const balanceData = await response.json();

        // Fetch Open Settlements (Pending Payouts) to show total funds including what's queued
        const settlementRes = await fetch('https://api.paystack.co/settlement?status=open', {
            method: 'GET',
            headers: authHeader
        });
        const settlementData = await settlementRes.json();

        let pendingKes = 0;
        if (settlementData.status && settlementData.data) {
            pendingKes = settlementData.data.reduce((sum, s) => {
                if (s.currency === 'KES') return sum + s.total_amount;
                return sum;
            }, 0);
        }

        if (balanceData.status && balanceData.data) {
            let kesObj = balanceData.data.find(b => b.currency === 'KES');
            if (kesObj) {
                kesObj.balance += pendingKes;
                kesObj.pending = pendingKes;
            } else if (pendingKes > 0) {
                balanceData.data.push({ currency: 'KES', balance: pendingKes, pending: pendingKes });
            }
        }

        res.json(balanceData);
    } catch (error) {
        console.error('Paystack Balance Error:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

router.get('/banks', async (req, res) => {
    try {
        // Fetch supported banks for KES
        const response = await fetch('https://api.paystack.co/bank?currency=KES', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
            }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Paystack Banks Error:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

router.post('/transferrecipient', async (req, res) => {
    try {
        const { type = 'mobile_money', name, account_number, bank_code } = req.body;
        const response = await fetch('https://api.paystack.co/transferrecipient', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type,
                name,
                account_number,
                bank_code,
                currency: 'KES'
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Paystack Transfer Recipient Error:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

router.post('/transfer', async (req, res) => {
    try {
        const { source = 'balance', amount, recipient, reason } = req.body;
        const response = await fetch('https://api.paystack.co/transfer', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source,
                amount: parseInt(amount), // in kobo/cents
                recipient,
                reason
            })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Paystack Transfer Error:', error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

export default router;
