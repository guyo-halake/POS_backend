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
  const { business_id, name, category, price, unit, stock, barcode, image, lowStockThreshold, buying_price, expiry_date, supplier_id } = product;
  const id = uuidv4();
  await pool.query(
    'INSERT INTO products (id, business_id, name, category, price, unit, stock, barcode, image, lowStockThreshold, buying_price, expiry_date, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, business_id || '11111111-1111-1111-1111-111111111111', name, category, price, unit, stock, barcode, image, lowStockThreshold, buying_price || 0, expiry_date || null, supplier_id || null]
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

export async function createBulkProducts(productsArray, businessId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const insertedIds = [];
    
    for (const product of productsArray) {
      const { name, category, price, unit, stock, barcode, image, lowStockThreshold, buying_price, expiry_date, supplier_id } = product;
      const id = uuidv4();
      const bizId = businessId || '11111111-1111-1111-1111-111111111111';
      
      await connection.query(
        'INSERT INTO products (id, business_id, name, category, price, unit, stock, barcode, image, lowStockThreshold, buying_price, expiry_date, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, bizId, name, category, price, unit, stock, barcode, image, lowStockThreshold || 10, buying_price || 0, expiry_date || null, supplier_id || null]
      );
      insertedIds.push(id);
    }
    
    await connection.commit();
    return insertedIds;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
