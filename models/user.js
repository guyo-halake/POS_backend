import pool from '../database/db.js';
import { v4 as uuidv4 } from 'uuid';

export async function getUserByPin(pin) {
  const [rows] = await pool.query('SELECT * FROM users WHERE pin = ? AND active = 1', [pin]);
  return rows[0];
}

export async function getAllUsers() {
  const [rows] = await pool.query('SELECT * FROM users WHERE active = 1');
  return rows;
}

export async function createUser({ name, pin, email, role, business_id }) {
  const id = uuidv4();
  const bizId = business_id || '11111111-1111-1111-1111-111111111111';
  await pool.query('INSERT INTO users (id, name, pin, email, role, active, business_id) VALUES (?, ?, ?, ?, ?, 1, ?)', [id, name, pin, email || null, role, bizId]);
  return id;
}

export async function updateUser(id, updates) {
  const { name, pin, email, role, active, otp, otpExpires } = updates;
  let query = 'UPDATE users SET ';
  const params = [];
  const fields = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (pin !== undefined) { fields.push('pin = ?'); params.push(pin); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email); }
  if (role !== undefined) { fields.push('role = ?'); params.push(role); }
  if (active !== undefined) { fields.push('active = ?'); params.push(active ? 1 : 0); }
  if (otp !== undefined) { fields.push('otp = ?'); params.push(otp); }
  if (otpExpires !== undefined) { fields.push('otpExpires = ?'); params.push(otpExpires); }

  if (fields.length === 0) return 0;

  query += fields.join(', ') + ' WHERE id = ?';
  params.push(id);

  const [result] = await pool.query(query, params);
  return result.affectedRows;
}

export async function deleteUser(id) {
  const [result] = await pool.query('UPDATE users SET active = 0 WHERE id = ?', [id]);
  return result.affectedRows;
}

