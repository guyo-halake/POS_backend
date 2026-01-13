// ...existing code...
import express from 'express';
import { getAllProducts, createProduct, updateProduct, deleteProduct } from '../models/product.js';
const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Add a product
router.post('/', async (req, res) => {
  try {
    const id = await createProduct(req.body);
    res.status(201).json({ id, ...req.body });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// Update a product
router.put('/:id', async (req, res) => {
  try {
    await updateProduct(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete a product
router.delete('/:id', async (req, res) => {
  try {
    await deleteProduct(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;
