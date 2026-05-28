// ...existing code...
import express from 'express';
import { getAllProducts, createProduct, updateProduct, deleteProduct } from '../models/product.js';
import { createLog } from '../models/auditLog.js';
const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    // In a full implementation, this comes from req.user.businessId (JWT)
    // For now, we trust the client to send the context or default to Business 1
    const businessId = req.headers['x-business-id'] || '11111111-1111-1111-1111-111111111111'; 
    const products = await getAllProducts(businessId);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Add a product
router.post('/', async (req, res) => {
  try {
    const businessId = req.headers['x-business-id'] || '11111111-1111-1111-1111-111111111111';
    const productData = { ...req.body, business_id: businessId };
    
    const id = await createProduct(productData);
    // Assuming backend logic or user context middleware provides user info, 
    // but here we might need to rely on what's passed or a future middleware.
    // For now, logging generic action or requiring headers.
    // Ideally, req.user would be populated. Let's log 'System' or check headers if simple.
    await createLog(req.headers['x-user-id'] || 0, req.headers['x-user-name'] || 'System', 'INVENTORY_ADD', `Added product: ${req.body.name}`);
    res.status(201).json({ id, ...req.body });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Update a product
router.put('/:id', async (req, res) => {
  try {
    await updateProduct(req.params.id, req.body);
    await createLog(req.headers['x-user-id'] || 0, req.headers['x-user-name'] || 'System', 'INVENTORY_UPDATE', `Updated product ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete a product
router.delete('/:id', async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    await createLog(req.headers['x-user-id'] || 0, req.headers['x-user-name'] || 'System', 'INVENTORY_DELETE', `Deleted product ID: ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
