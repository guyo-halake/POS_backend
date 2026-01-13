import pool from '../database/db.js';

export async function getAllProducts() {
  const [rows] = await pool.query('SELECT * FROM products');
  return rows;
}

export async function getProductById(id) {
  const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
  return rows[0];
}

export async function createProduct(product) {
  const { name, category, price, unit, stock, barcode, image, lowStockThreshold } = product;
  const [result] = await pool.query(
    'INSERT INTO products (name, category, price, unit, stock, barcode, image, lowStockThreshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, category, price, unit, stock, barcode, image, lowStockThreshold]
  );
  return result.insertId;
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
