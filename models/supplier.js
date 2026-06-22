import pool from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export async function getAllSuppliers(businessId) {
  let query = 'SELECT * FROM suppliers';
  const params = [];
  
  if (businessId && businessId !== 'GLOBAL' && businessId !== '*') {
    query += ' WHERE business_id = ?';
    params.push(businessId);
  }
  
  const [rows] = await pool.query(query, params);
  return rows;
}

export async function getSupplierById(id) {
  const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
  return rows[0];
}

export async function createSupplier(supplierData, businessId) {
  const { name, phone, email, goods } = supplierData;
  const id = uuidv4();
  const bizId = businessId || '11111111-1111-1111-1111-111111111111';
  
  await pool.query(
    'INSERT INTO suppliers (id, business_id, name, phone, email, goods) VALUES (?, ?, ?, ?, ?, ?)',
    [id, bizId, name, phone || null, email || null, goods || null]
  );
  return id;
}

export async function updateSupplier(id, updates) {
  const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(id);
  await pool.query(`UPDATE suppliers SET ${fields} WHERE id = ?`, values);
}

export async function deleteSupplier(id) {
  await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
}
