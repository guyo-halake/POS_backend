import express from 'express';
import nodemailer from 'nodemailer';
import pool, { dbPath } from '../database/db.js';
import { getDashboardStats } from '../models/sale.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Get real-time system architecture and database status
router.get('/status', async (req, res) => {
  try {
    // Quick test of SQLite
    await pool.query('SELECT 1');
    const sqliteStatus = 'Online';

    // Assume Supabase is reachable if URL is present. (In a real app, you'd ping it)
    const supabaseStatus = process.env.SUPABASE_URL ? 'Connected' : 'Not Configured';

    // Paystack status
    const paystackStatus = process.env.PAYSTACK_SECRET_KEY ? 'Online' : 'Not Configured';

    res.json({
      success: true,
      primaryDatabase: 'Local SQLite',
      primaryStatus: sqliteStatus,
      databasePath: dbPath,
      syncTarget: 'Supabase PostgreSQL',
      syncStatus: supabaseStatus,
      paystackStatus: paystackStatus,
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

// Download SQLite Database Backup
router.get('/backup', (req, res) => {
  try {
    if (fs.existsSync(dbPath)) {
      const fileName = `pos_backup_${new Date().toISOString().split('T')[0]}.db`;
      res.download(dbPath, fileName);
    } else {
      res.status(404).json({ error: 'Database file not found on server' });
    }
  } catch (err) {
    console.error('Backup failed:', err);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Clear all sales data
router.post('/wipe-sales', async (req, res) => {
  try {
    await pool.query('DELETE FROM sale_items');
    await pool.query('DELETE FROM sales');
    res.json({ success: true, message: 'All sales data cleared' });
  } catch (err) {
    console.error('Wipe sales failed:', err);
    res.status(500).json({ error: 'Failed to clear sales data' });
  }
});

// Clear all products data
router.post('/wipe-products', async (req, res) => {
  try {
    await pool.query('DELETE FROM products');
    res.json({ success: true, message: 'All products cleared' });
  } catch (err) {
    console.error('Wipe products failed:', err);
    res.status(500).json({ error: 'Failed to clear products' });
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

// Dispatch custom email
router.post('/send-email', async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
      console.log('--- SIMULATED EMAIL SEND ---');
      console.log(`To: ${to}\nSubject: ${subject}\nMessage: ${message}`);
      console.log('----------------------------');
      return res.json({ success: true, simulated: true, message: 'Simulated send: No SMTP credentials configured' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
      }
    });

    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to,
      subject,
      html: message // assumes frontend sends formatted HTML or text
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, simulated: false });
  } catch (err) {
    console.error('Send email failed:', err);
    res.status(500).json({ error: 'Failed to send email', details: err.message });
  }
});

// --- EMAIL TEMPLATES ---
import { v4 as uuidv4 } from 'uuid';

router.get('/templates', async (req, res) => {
  try {
    const [templates] = await pool.query('SELECT * FROM email_templates ORDER BY created_at DESC');
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

router.post('/templates', async (req, res) => {
  try {
    const { name, subject, body } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO email_templates (id, name, subject, body) VALUES (?, ?, ?, ?)',
      [id, name, subject, body]
    );
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const { name, subject, body } = req.body;
    await pool.query(
      'UPDATE email_templates SET name=?, subject=?, body=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [name, subject, body, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM email_templates WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// --- SUPPORT TICKETS ---
router.get('/tickets', async (req, res) => {
  try {
    const [tickets] = await pool.query(`
      SELECT t.*, b.name as business_name 
      FROM support_tickets t 
      LEFT JOIN businesses b ON t.business_id = b.id 
      ORDER BY t.created_at DESC
    `);
    res.json({ success: true, tickets });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.put('/tickets/:id/status', async (req, res) => {
  try {
    const { status } = req.body; // 'open' or 'resolved'
    await pool.query('UPDATE support_tickets SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

router.post('/tickets', async (req, res) => {
  try {
    const { business_id, sender_name, subject, message } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO support_tickets (id, business_id, sender_name, subject, message) VALUES (?, ?, ?, ?, ?)',
      [id, business_id || '11111111-1111-1111-1111-111111111111', sender_name, subject, message]
    );
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit ticket' });
  }
});

// --- SEEDERS ---
router.post('/seed-users', async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ error: 'Data must be an array' });
    
    for (const user of data) {
      if (!user.name || !user.email || !user.pin || !user.role) continue;
      await pool.query(
        'INSERT INTO users (business_id, name, email, pin, role) VALUES (?, ?, ?, ?, ?)',
        [user.business_id, user.name, user.email, user.pin.toString(), user.role.toLowerCase()]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Seed users error:', err);
    res.status(500).json({ error: 'Failed to seed users', details: err.message });
  }
});

router.post('/seed-products', async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ error: 'Data must be an array' });

    for (const prod of data) {
      if (!prod.name || !prod.price) continue;
      const id = uuidv4();
      await pool.query(
        'INSERT INTO products (id, business_id, name, price, buying_price, category, stock) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, prod.business_id, prod.name, parseFloat(prod.price), parseFloat(prod.buying_price || 0), prod.category || 'Uncategorized', parseInt(prod.stock || 0)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Seed products error:', err);
    res.status(500).json({ error: 'Failed to seed products', details: err.message });
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
      const [users] = await pool.query("SELECT id, name, role, email, last_active, active, pin FROM users WHERE business_id = ?", [biz.id]);
      biz.users = users;
      biz.userCount = users.length;

      // Get all products for this business
      const [products] = await pool.query("SELECT id, name, price, stock, category FROM products WHERE business_id = ?", [biz.id]);
      biz.products = products;
      const [salesResult] = await pool.query(`
        SELECT 
          SUM(s.total) as totalRevenue,
          (
            SELECT SUM((si.price - COALESCE(p.buying_price, 0)) * si.quantity)
            FROM sale_items si
            LEFT JOIN products p ON si.productId = p.id
            WHERE si.saleId IN (SELECT id FROM sales WHERE business_id = ?)
          ) as trueProfit
        FROM sales s WHERE business_id = ?
      `, [biz.id, biz.id]);
      biz.totalRevenue = salesResult[0].totalRevenue || 0;
      biz.totalProfit = salesResult[0].trueProfit || 0;
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
      [name || null, email || null, phone || null, location || null, logo || null, typeof payment_config === 'object' ? JSON.stringify(payment_config) : payment_config || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to update business:', err);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// Admin wipe sales route
router.post('/wipe-sales', async (req, res) => {
  try {
    const businessId = req.headers['x-business-id'] || 'default_business';
    await pool.query('DELETE FROM sales WHERE business_id = ?', [businessId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to wipe sales:', err);
    res.status(500).json({ error: 'Failed to wipe sales' });
  }
});

// Admin wipe products route
router.post('/wipe-products', async (req, res) => {
  try {
    const businessId = req.headers['x-business-id'] || 'default_business';
    await pool.query('DELETE FROM products WHERE business_id = ?', [businessId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to wipe products:', err);
    res.status(500).json({ error: 'Failed to wipe products' });
  }
});

export default router;
