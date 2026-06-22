import express from 'express';
import { getAllSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../models/supplier.js';
import { createLog } from '../models/auditLog.js';

const router = express.Router();

// Get all suppliers
router.get('/', async (req, res) => {
  try {
    const businessId = req.headers['x-business-id'] || '11111111-1111-1111-1111-111111111111';
    const suppliers = await getAllSuppliers(businessId);
    res.json(suppliers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

// Add a supplier
router.post('/', async (req, res) => {
  try {
    const businessId = req.headers['x-business-id'] || '11111111-1111-1111-1111-111111111111';
    const id = await createSupplier(req.body, businessId);
    await createLog(req.headers['x-user-id'] || 0, req.headers['x-user-name'] || 'System', 'SUPPLIER_ADD', `Added supplier: ${req.body.name}`);
    res.status(201).json({ id, ...req.body, business_id: businessId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add supplier' });
  }
});

// Update a supplier
router.put('/:id', async (req, res) => {
  try {
    await updateSupplier(req.params.id, req.body);
    await createLog(req.headers['x-user-id'] || 0, req.headers['x-user-name'] || 'System', 'SUPPLIER_UPDATE', `Updated supplier ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// Delete a supplier
router.delete('/:id', async (req, res) => {
  try {
    await deleteSupplier(req.params.id);
    await createLog(req.headers['x-user-id'] || 0, req.headers['x-user-name'] || 'System', 'SUPPLIER_DELETE', `Deleted supplier ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

export default router;
