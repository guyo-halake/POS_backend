import express from 'express';
import { getAllSales, createSale, getDashboardStats } from '../models/sale.js';
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const sales = await getAllSales();
    res.json(sales);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const range = req.query.range || 'today';
    const stats = await getDashboardStats(range);
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', async (req, res) => {
  try {
    await createSale(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record sale' });
  }
});

export default router;
