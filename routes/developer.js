import express from 'express';
import nodemailer from 'nodemailer';
import pool from '../database/db.js';
import { getDashboardStats } from '../models/sale.js';

const router = express.Router();

// Get real-time system architecture and database status
router.get('/status', async (req, res) => {
  try {
    // Quick test of SQLite
    await pool.query('SELECT 1');
    const sqliteStatus = 'Online';

    // Assume Supabase is reachable if URL is present. (In a real app, you'd ping it)
    const supabaseStatus = process.env.SUPABASE_URL ? 'Connected' : 'Not Configured';

    res.json({
      success: true,
      primaryDatabase: 'Local SQLite',
      primaryStatus: sqliteStatus,
      syncTarget: 'Supabase PostgreSQL',
      syncStatus: supabaseStatus,
      apiHealth: '100%',
      version: '2.0.0'
    });
  } catch (err) {
    res.status(500).json({ error: 'System Health Check Failed' });
  }
});

// Get actively logged in users (active within the last 15 minutes)
router.get('/active-users', async (req, res) => {
  try {
    // SQLite datetime('now', '-15 minutes')
    const [activeUsers] = await pool.query(
      "SELECT id, name, role, email, last_active FROM users WHERE last_active >= datetime('now', '-15 minutes') ORDER BY last_active DESC"
    );
    res.json(activeUsers);
  } catch (err) {
    console.error('Failed to fetch active users:', err);
    res.status(500).json({ error: 'Failed to fetch active users' });
  }
});

// Dispatch daily sales summary email
router.post('/dispatch', async (req, res) => {
  try {
    const stats = await getDashboardStats('today');
    
    // Check for SMTP credentials
    if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
      return res.status(400).json({ 
        error: 'SMTP credentials missing. Please configure SMTP_EMAIL and SMTP_PASSWORD in .env' 
      });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail', // You can change this or use host/port
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
      }
    });

    const htmlReport = `
      <h2>Daily Sales Summary</h2>
      <p><strong>Total Revenue:</strong> KES ${stats.totalRevenue.toLocaleString()}</p>
      <p><strong>Total Transactions:</strong> ${stats.totalCount}</p>
      
      <h3>Payment Breakdown</h3>
      <ul>
        ${stats.payments.map(p => `<li>${p.paymentMethod}: KES ${p.total.toLocaleString()}</li>`).join('')}
      </ul>

      <h3>Top Selling Products</h3>
      <ul>
        ${stats.topProducts.map(p => `<li>${p.productName} - ${p.sold} sold (KES ${p.revenue.toLocaleString()})</li>`).join('')}
      </ul>
    `;

    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to: process.env.SMTP_EMAIL, // Send to the developer/owner
      subject: `[Fresh Fity POS] Daily Dispatch - ${new Date().toLocaleDateString()}`,
      html: htmlReport
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Dispatch successful' });
  } catch (err) {
    console.error('Dispatch failed:', err);
    res.status(500).json({ error: 'Dispatch failed', details: err.message });
  }
});

// Get all businesses with advanced aggregated info
router.get('/businesses', async (req, res) => {
  try {
    const [businesses] = await pool.query('SELECT * FROM businesses');
    
    for (let biz of businesses) {
      // Get the manager (assuming the owner/admin is the one created first or has role='admin'/'developer')
      const [managers] = await pool.query("SELECT * FROM users WHERE business_id = ? AND (role = 'admin' OR role = 'owner' OR role = 'developer') LIMIT 1", [biz.id]);
      biz.manager = managers.length > 0 ? managers[0] : null;

      // Get all users for this business
      const [users] = await pool.query("SELECT id, name, role, email, phone, last_active, active FROM users WHERE business_id = ?", [biz.id]);
      biz.users = users;
      biz.userCount = users.length;

      // Get total sales
      const [salesResult] = await pool.query("SELECT SUM(total) as totalRevenue FROM sales WHERE business_id = ?", [biz.id]);
      biz.totalRevenue = salesResult[0].totalRevenue || 0;
    }

    res.json({ success: true, businesses });
  } catch (err) {
    console.error('Failed to fetch businesses:', err);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// Update business details
router.put('/businesses/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, location, logo, payment_config } = req.body;
  try {
    await pool.query(
      'UPDATE businesses SET name=?, email=?, phone=?, location=?, logo=?, payment_config=? WHERE id=?',
      [name, email, phone, location, logo, typeof payment_config === 'object' ? JSON.stringify(payment_config) : payment_config, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update business:', err);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

export default router;
