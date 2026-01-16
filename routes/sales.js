import express from 'express';
import { getAllSales, createSale, getDashboardStats } from '../models/sale.js';
import { createLog } from '../models/auditLog.js';
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
    const saleId = await createSale(req.body);
    await createLog(req.body.cashierId, req.body.cashierName || 'Unknown', 'SALE', `Sale completed. Total: ${req.body.total}`);
    res.json({ success: true, id: saleId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record sale' });
  }
});

export default router;
