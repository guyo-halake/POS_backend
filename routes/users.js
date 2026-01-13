import express from 'express';
import { getUserByPin, getAllUsers, createUser, updateUser, deleteUser } from '../models/user.js';
import nodemailer from 'nodemailer';
const router = express.Router();


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
// PIN reset via email (production)
router.post('/reset-pin', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  try {
    // Find user by email in DB
    const users = await getAllUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Send email with nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail', // or your SMTP provider
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'FreshFity POS PIN Reset',
      text: `Hello ${user.name},\n\nTo reset your PIN, please contact the administrator or follow the provided instructions.\n\nThank you.`
    };
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Reset link sent to email.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to send reset email' });
  }
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

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteUser(req.params.id);
    res.json({ success: !!deleted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Login (PIN-based)
router.post('/login', async (req, res) => {
  const { pin } = req.body;
  const user = await getUserByPin(pin);
  if (user && user.active) {
    res.json({ success: true, user });
  } else {

    res.status(401).json({ success: false, error: 'Invalid PIN' });

  }
});

// ...existing code...

export default router;
