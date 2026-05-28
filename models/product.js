import pool from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export async function getAllProducts(businessId) {
  let query = 'SELECT * FROM products';
  const params = [];
  
  if (businessId && businessId !== 'GLOBAL' && businessId !== '*') {
    query += ' WHERE business_id = ?';
    params.push(businessId);
  }
  
  const [rows] = await pool.query(query, params);
  return rows;
}

export async function getProductById(id) {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  return rows[0];
}

export async function createProduct(product) {
  const { business_id, name, category, price, unit, stock, barcode, image, lowStockThreshold } = product;
  const id = uuidv4();
  await pool.query(
    'INSERT INTO products (id, business_id, name, category, price, unit, stock, barcode, image, lowStockThreshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, business_id || '11111111-1111-1111-1111-111111111111', name, category, price, unit, stock, barcode, image, lowStockThreshold]
  );
  return id;
}

export async function updateProduct(id, updates) {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(id);
  await pool.query(`UPDATE products SET ${fields} WHERE id = ?`, values);
}

export async function deleteProduct(id) {
  await pool.query('DELETE FROM products WHERE id = ?', [id]);
}
