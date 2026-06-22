import express from 'express';
import { getAllSales, createSale, getDashboardStats } from '../models/sale.js';
import { createLog } from '../models/auditLog.js';
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const businessId = req.headers['x-business-id'];
    const sales = await getAllSales(businessId);
    res.json(sales);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const businessId = req.headers['x-business-id'];
    const range = req.query.range || 'today';
    const stats = await getDashboardStats(businessId, range);
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', async (req, res) => {
  try {
    const businessId = req.headers['x-business-id'] || 'default_business';
    const saleId = await createSale(req.body, businessId);
    await createLog(req.body.cashierId, req.body.cashierName || 'Unknown', 'SALE', `Sale completed. Total: ${req.body.total}`);
    res.json({ success: true, id: saleId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record sale' });
  }
});

export default router;
