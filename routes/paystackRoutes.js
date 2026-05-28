import express from 'express';

const router = express.Router();

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

        const response = await fetch('https://api.paystack.co/charge', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
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
        
        const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
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

export default router;
