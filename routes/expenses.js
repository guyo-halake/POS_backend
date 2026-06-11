import express from 'express';
import pool from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// GET all expenses
router.get('/', async (req, res) => {
  try {
    const [expenses] = await pool.query('SELECT * FROM expenses ORDER BY timestamp DESC');
    res.json(expenses);
  } catch (err) {
    console.error('Failed to fetch expenses:', err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// POST a new expense
router.post('/', async (req, res) => {
  const { amount, category, description } = req.body;
  if (!amount || isNaN(amount)) {
    return res.status(400).json({ error: 'Valid expense amount is required' });
  }

  try {
    const id = uuidv4();
    await pool.query(
      "INSERT INTO expenses (id, amount, category, description, timestamp) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))",
      [id, parseFloat(amount), category || 'General', description || '']
    );
    res.json({ success: true, id });
  } catch (err) {
    console.error('Failed to create expense:', err);
    res.status(500).json({ error: 'Failed to record expense' });
  }
});

export default router;
