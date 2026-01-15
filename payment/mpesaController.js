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

// Token Cache
let tokenCache = {
  token: null,
  expiry: 0
};

// Helper to get access token
async function getAccessToken() {
  // Check cache first
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiry > now) {
    return tokenCache.token;
  }

  if (!mpesaConfig.consumerKey || !mpesaConfig.consumerSecret || 
      mpesaConfig.consumerKey === 'your_consumer_key_here' || 
      mpesaConfig.consumerSecret === 'your_consumer_secret_here') {
      console.error("❌ M-Pesa keys are missing or set to default placeholders. Please update freshfity-pos-backend/.env");
      return null;
  }
  const auth = Buffer.from(`${mpesaConfig.consumerKey}:${mpesaConfig.consumerSecret}`).toString('base64');
  try {
    const response = await fetch('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    const text = await response.text();
    // console.log("M-Pesa Token Response Status:", response.status); 
    // console.log("M-Pesa Token Response Body:", text);

    if (!response.ok) {
        console.error('M-Pesa Access Token Failed. Status:', response.status);
        return null; // Or handle error appropriately
    }

    try {
        const data = JSON.parse(text);
        // Cache the token (expires_in is usually 3599 seconds)
        // Subtract 60 seconds for safety buffer
        const expiresInMs = (parseInt(data.expires_in) - 60) * 1000;
        tokenCache = {
          token: data.access_token,
          expiry: now + expiresInMs
        };
        console.log("✅ Fetched new M-Pesa Access Token");
        return data.access_token;
    } catch (e) {
        console.error("Failed to parse M-Pesa response as JSON:", e);
        return null;
    }

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

// Check Status (Polling with Active Query)
export const checkStatus = async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const [rows] = await pool.query('SELECT * FROM mpesa_transactions WHERE checkoutRequestID = ?', [checkoutRequestId]);
    
    if (rows.length === 0) {
      return res.json({ status: 'PENDING' }); // Unknown ID, treat as pending
    }

    const transaction = rows[0];

    // If still PENDING, let's ask Safaricom directly (M-Pesa Express Query)
    if (transaction.status === 'PENDING') {
       const token = await getAccessToken();
       if (token) {
           const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
           const password = Buffer.from(`${mpesaConfig.businessShortCode}${mpesaConfig.passKey}${timestamp}`).toString('base64');
           
           const payload = {
            BusinessShortCode: mpesaConfig.businessShortCode,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestId
           };

           try {
             const queryRes = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
             });
             
             const queryData = await queryRes.json();
            //  console.log('Query Response:', queryData);
             
             if (queryData.ResultCode === "0") {
                 // Success!
                 const successDesc = "Payment confirmed via Query";
                 console.log(`Payment Confirmed via Query!`);
                 await pool.query(
                    'UPDATE mpesa_transactions SET status = ?, resultCode = ?, resultDesc = ? WHERE checkoutRequestID = ?',
                    ['COMPLETED', queryData.ResultCode, queryData.ResultDesc || successDesc, checkoutRequestId]
                  );
                  // Refresh transaction object
                  transaction.status = 'COMPLETED';
             } else if (queryData.ResultCode && queryData.ResultCode !== "0" && queryData.errorCode !== "500.001.1001" && !queryData.ResultDesc?.toLowerCase().includes("process")) { 
                 // Note: 500.001.1001 means "The transaction is being processed", so we ignore it and keep PENDING
                 // Other codes mean failure/cancellation
                 console.log(`Payment Failed via Query: ${queryData.ResultDesc}`);
                 await pool.query(
                    'UPDATE mpesa_transactions SET status = ?, resultCode = ?, resultDesc = ? WHERE checkoutRequestID = ?',
                    ['FAILED', queryData.ResultCode, queryData.ResultDesc, checkoutRequestId]
                  );
                  transaction.status = 'FAILED';
             }
           } catch(err) {
               console.error("Query API Error:", err);
           }
       }
    }

    res.json({
      status: transaction.status,
      mpesaReceiptNumber: transaction.mpesaReceiptNumber || 'N/A', // Query API doesn't return receipt ref sometimes?
      amount: transaction.amount,
      phoneNumber: transaction.phoneNumber
    });
  } catch (error) {
    console.error('Check Status Error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
};
