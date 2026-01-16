import express from 'express';
import { getLogs, createLog } from '../models/auditLog.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const logs = await getLogs();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

router.post('/', async (req, res) => {
  const { userId, userName, action, details } = req.body;
  try {
    await createLog(userId, userName, action, details);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create log' });
  }
});

export default router;
