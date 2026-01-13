import fetch from 'node-fetch';
import pool from '../database/db.js';

const mpesaConfig = {
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    businessShortCode: "174379",
    passKey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
    callBackURL: process.env.MPESA_CALLBACK_URL || "https://freshfity-backend.onrender.com/api/mpesa/callback",
    accountReference: "FreshFityPOS",
    transactionDesc: "Payment for Goods"
};

// Helper to get access token
async function getAccessToken() {
  const auth = Buffer.from(`${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`).toString('base64');
  try {
    const response = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('M-Pesa Access Token Failed:', data);
      return null;
    }
    return data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    return null;
  }
}

// Initiate STK Push
export const initiateSTKPush = async (req, res) => {
  const { phone, amount, orderId } = req.body;
  const token = await getAccessToken();

  if (!token) {
    return res.status(500).json({ success: false, error: 'Failed to authenticate with M-Pesa' });
  }

  // Format phone (254...)
  let formattedPhone = phone;
  if (phone.startsWith('0')) formattedPhone = `254${phone.slice(1)}`;
  if (phone.startsWith('+')) formattedPhone = phone.slice(1);

  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${mpesaConfig.businessShortCode}${mpesaConfig.passKey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: mpesaConfig.businessShortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.floor(amount), // Amounts must be whole numbers often, but STK supports decimals sometimes. Safer to round for now.
    PartyA: formattedPhone,
    PartyB: mpesaConfig.businessShortCode,
    PhoneNumber: formattedPhone,
    CallBackURL: mpesaConfig.callBackURL,
    AccountReference: mpesaConfig.accountReference,
    TransactionDesc: `POS Sale ${orderId}`
  };

  try {
    const response = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    console.log('M-Pesa STK Response:', data);

    if (data.ResponseCode === "0") {
      // Save pending transaction
      await pool.query(
        'INSERT INTO mpesa_transactions (checkoutRequestID, merchantRequestID, status, phoneNumber) VALUES (?, ?, ?, ?)',
        [data.CheckoutRequestID, data.MerchantRequestID, 'PENDING', formattedPhone]
      );

      return res.json({ success: true, data });
    } else {
      console.error('M-Pesa STK Push Failed:', data);
      return res.status(400).json({ success: false, error: data.errorMessage || 'STK Push failed' });
    }

  } catch (error) {
    console.error('STK Push Error:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

// Handle Callback
export const handleCallback = async (req, res) => {
  console.log('--- M-Pesa Callback Received ---');
  // console.log(JSON.stringify(req.body, null, 2));

  try {
    const body = req.body.Body.stkCallback;
    const checkoutRequestID = body.CheckoutRequestID;
    const resultCode = body.ResultCode;
    const resultDesc = body.ResultDesc;

    if (resultCode === 0) {
      // Payment Successful
      const metadata = body.CallbackMetadata.Item;
      const amount = metadata.find(i => i.Name === 'Amount')?.Value;
      const mpesaReceiptNumber = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
      const phoneNumber = metadata.find(i => i.Name === 'PhoneNumber')?.Value;
      
      console.log(`Payment Confirmed: ${mpesaReceiptNumber}`);
      
      await pool.query(
        'UPDATE mpesa_transactions SET status = ?, resultCode = ?, resultDesc = ?, mpesaReceiptNumber = ?, amount = ? WHERE checkoutRequestID = ?',
        ['COMPLETED', resultCode, resultDesc, mpesaReceiptNumber, amount, checkoutRequestID]
      );
    } else {
      console.log('Payment Failed/Cancelled');
      await pool.query(
        'UPDATE mpesa_transactions SET status = ?, resultCode = ?, resultDesc = ? WHERE checkoutRequestID = ?',
        ['FAILED', resultCode, resultDesc, checkoutRequestID]
      );
    }

    res.json({ result: "ok" });
  } catch (error) {
    console.error('Callback Error:', error);
    res.status(500).json({ result: "error" });
  }
};

// Check Status (Polling)
export const checkStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const [rows] = await pool.query('SELECT * FROM mpesa_transactions WHERE checkoutRequestID = ?', [checkoutRequestId]);
    
    if (rows.length === 0) {
      return res.json({ status: 'PENDING' }); // Unknown ID, treat as pending logic or 404
    }

    const transaction = rows[0];
    res.json({
      status: transaction.status,
      mpesaReceiptNumber: transaction.mpesaReceiptNumber,
      amount: transaction.amount
    });
  } catch (error) {
    console.error('Check Status Error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
};
