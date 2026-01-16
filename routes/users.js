import express from 'express';
import pool from '../database/db.js';
import { getUserByPin, getAllUsers, createUser, updateUser, deleteUser } from '../models/user.js';
import { createLog } from '../models/auditLog.js';
import nodemailer from 'nodemailer';
const router = express.Router();

// Gateway for future Twilio/WhatsApp integration
async function sendOTP({ method, to, message }) {
  if (method === 'email') {
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject: 'Your FreshFity POS OTP/PIN',
      text: message,
    });
  } else if (method === 'twilio' || method === 'whatsapp') {
    // Placeholder for future integration
    return Promise.resolve('Gateway not implemented');
  }
}


// Get all users
router.get('/', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// (FastAPI sync removed for production DB usage)
// PIN reset request: generate OTP, send custom email
router.post('/request-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  try {
    const users = await getAllUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Generate and store OTP (not as PIN)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // 10 min expiry
    await updateUser(user.id, user);

    // Custom HTML email template
    const html = `
      <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px;border-radius:8px;background:#f9f9f9;">
        <img src='https://freshfity.com/logo2.png' alt='FreshFity Logo' style='width:120px;margin-bottom:16px;'/>
        <h2>Hello, ${user.name}</h2>
        <p>A reset PIN option has been requested on your Fresh Fity POS.</p>
        <p style='font-size:18px;font-weight:bold;background:#fff3cd;padding:12px;border-radius:6px;'>Temporary verification code: <span style='font-size:22px;font-weight:bold;'>${otp}</span></p>
        <p>Enter this code in the app to continue.</p>
        <p style='font-size:12px;color:#888;'>If you did not request this, please contact your administrator.</p>
      </div>
    `;
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'FreshFity POS PIN Reset Verification',
      html,
    });
    res.json({ success: true, message: 'OTP sent to email.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to send OTP', details: err.message });
  }
});

// OTP verification endpoint
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, error: 'Email and OTP required' });
  const users = await getAllUsers();
  const user = users.find(u => u.email === email);
  if (!user || !user.otp || !user.otpExpires) return res.status(400).json({ success: false, error: 'No OTP found' });
  if (Date.now() > user.otpExpires) return res.status(400).json({ success: false, error: 'OTP expired' });
  if (user.otp !== otp) return res.status(400).json({ success: false, error: 'Invalid OTP' });
  res.json({ success: true });
});

// Set new PIN after OTP verified
router.post('/reset-pin', async (req, res) => {
  const { email, otp, newPin } = req.body;
  if (!email || !otp || !newPin) return res.status(400).json({ success: false, error: 'Missing fields' });
  const users = await getAllUsers();
  const user = users.find(u => u.email === email);
  if (!user || !user.otp || !user.otpExpires) return res.status(400).json({ success: false, error: 'No OTP found' });
  if (Date.now() > user.otpExpires) return res.status(400).json({ success: false, error: 'OTP expired' });
  if (user.otp !== otp) return res.status(400).json({ success: false, error: 'Invalid OTP' });
  user.pin = newPin;
  user.otp = null;
  user.otpExpires = null;
  await updateUser(user.id, user);

  // Confirmation email
  const html = `
    <div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px;border-radius:8px;background:#f9f9f9;">
      <img src='https://freshfity.com/logo2.png' alt='FreshFity Logo' style='width:120px;margin-bottom:16px;'/>
      <h2>Hi ${user.name},</h2>
      <p>Your POS PIN has been changed on ${new Date().toLocaleString()}.</p>
      <p>If you did not request this, contact your administrator immediately.</p>
    </div>
  `;
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'FreshFity POS PIN Changed',
    html,
  });

  // Notify admin/developer
  const admins = users.filter(u => u.role === 'Admin' || u.role === 'Developer');
  for (const admin of admins) {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: admin.email,
      subject: 'POS PIN Change Notification',
      html: `<p>User <b>${user.name}</b> (${user.email}) changed their POS PIN on ${new Date().toLocaleString()}.</p>`
    });
  }
  res.json({ success: true, message: 'PIN changed and notifications sent.' });
});
// Create new user (Sign Up)
router.post('/', async (req, res) => {
  const { name, pin, email, role } = req.body;
  if (!name || !pin || !email || !role) {
    return res.status(400).json({ success: false, error: 'Missing fields' });
  }
  // Create user in MySQL
  const id = await createUser({ name, pin, email, role });
  res.json({ success: true, user: { id, name, pin, email, role, active: 1 } });
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await updateUser(req.params.id, req.body);
    res.json({ success: !!updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Update User PIN (Admin/Developer action)
router.post('/update-pin', async (req, res) => {
    const { userId, newPin } = req.body;
    if (!userId || !newPin) return res.status(400).json({ success: false, error: 'Missing userId or newPin' });
    try {
        await updateUser(userId, { pin: newPin });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to update PIN' });
    }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteUser(req.params.id);
    res.json({ success: !!deleted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});


// Request Mobile App (Simulated Link)
router.get('/request-mobile-app/:businessId', async (req, res) => {
    const { businessId } = req.params;
    try {
        await pool.query('UPDATE businesses SET mobile_app_requested = 1 WHERE id = ?', [businessId]);
        res.send(`
            <h1>Request Received!</h1>
            <p>Your request for the Manager's Mobile App has been sent to the Developer Dashboard.</p>
            <p>We will contact you shortly.</p>
            <script>setTimeout(() => window.close(), 3000);</script>
        `);
    } catch (err) {
        res.status(500).send("Error processing request.");
    }
});

// Create new Client Business & Manager
router.post('/create-client', async (req, res) => {
    const { business, manager } = req.body;
    
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Create Business
        const [bizResult] = await connection.query(
            'INSERT INTO businesses (name, email, phone, logo, payment_config) VALUES (?, ?, ?, ?, ?)',
            [business.name, business.email, business.phone, business.logo, JSON.stringify(business.paymentConfig)]
        );
        const businessId = bizResult.insertId;

        // 2. Create Manager (User) linked to Business
        await connection.query(
            'INSERT INTO users (name, email, pin, role, active, business_id) VALUES (?, ?, ?, ?, 1, ?)',
            [manager.name, manager.email, manager.pin, manager.role, businessId]
        );

        await connection.commit();

        // 3. Send Welcome Email (Simulated or Real)
        const requestLink = `${process.env.API_URL || 'http://localhost:5001'}/api/users/request-mobile-app/${businessId}`;
        const emailContent = `
            Hello ${manager.name},
            
            Welcome to P3L Developer!
            Your POS system is ready.
            
            Please use this PIN to login: ${manager.pin}
            
            An online version of your account is always live at: www.p3lPOS.vercel.app
            
            <a href="${requestLink}">Click here to request for your managers' mobile app</a>
        `;

        if (manager.email) {
            // Log to console for dev visibility
            console.log("---------------------------------------------------");
            console.log(`Sending Welcome Email to: ${manager.email}`);
            console.log(emailContent);
            console.log("---------------------------------------------------");

            // Try sending real email if configured
            try {
                let transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
                });
                await transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: manager.email,
                    subject: 'Welcome to P3L POS - Account Ready',
                    html: emailContent.replace(/\n/g, '<br/>')
                });
            } catch (e) {
                console.log("Email sending failed (probably no credentials), but logged above.");
            }
        }

        res.json({ success: true, businessId });
    } catch (error) {
        await connection.rollback();
        console.error("Create Client Error:", error);
        res.status(500).json({ success: false, error: error.code === 'ER_DUP_ENTRY' ? 'PIN already in use' : 'Failed to create client' });
    } finally {
        connection.release();
    }
});

// Login (PIN-based)
router.post('/login', async (req, res) => {
  const { pin } = req.body;
  try {
      const user = await getUserByPin(pin);
      if (user && user.active) {
        await createLog(user.id, user.name, 'LOGIN', 'User logged in');
        
        let business = null;
        if (user.business_id) {
            const [bizRows] = await pool.query('SELECT * FROM businesses WHERE id = ?', [user.business_id]);
            if (bizRows.length > 0) business = bizRows[0];
        }

        const userWithBiz = { ...user, business };

        res.json({ success: true, user: userWithBiz });
      } else {
        res.status(401).json({ success: false, error: 'Invalid PIN' });
      }
  } catch (e) {
      console.error(e);
      res.status(500).json({ success: false, error: 'Login error' });
  }
});

// ...existing code...

export default router;
