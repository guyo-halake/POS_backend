import fetch from 'node-fetch';
import { mpesaConfig } from '../secure/mpesaCredentials.js';
import pool from '../database/db.js';

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
      // Save the CheckoutRequestID to DB to link the callback later
      // We assume an 'sales' or 'mpesa_transactions' table exists or we update the sale note
      // For now, we'll just log it or update the sale if it was already created.
      // Since the frontend is waiting, we return success.
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
  console.log(JSON.stringify(req.body, null, 2));

  // logic to process result
  const body = req.body.Body.stkCallback;
  
  if (body.ResultCode === 0) {
    // Payment Successful
    const metadata = body.CallbackMetadata.Item;
    const amount = metadata.find(i => i.Name === 'Amount')?.Value;
    const mpesaReceiptNumber = metadata.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const phoneNumber = metadata.find(i => i.Name === 'PhoneNumber')?.Value;
    
    // TODO: Update database 'sales' table where CheckoutRequestID matches (if stored)
    // Or insert into mpesa_transactions table
    
    console.log(`Payment Confirmed: ${mpesaReceiptNumber} - KES ${amount} from ${phoneNumber}`);
    
    // Example: Save to a simple in-memory store or DB if we had the schema
    // await pool.query("INSERT INTO mpesa_logs SET ?", { ... })
  } else {
    console.log('Payment Failed/Cancelled');
  }

  res.json({ result: "ok" });
};

// Check Status (Polling)
export const checkStatus = async (req, res) => {
  // logic to query Safaricom status API if needed
  // For now, we rely on the callback updating the DB
  res.json({ status: 'pending' }); // Placeholder
};
