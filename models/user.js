import pool from '../database/db.js';

export async function getUserByPin(pin) {
  const [rows] = await pool.query('SELECT * FROM users WHERE pin = ? AND active = 1', [pin]);
  return rows[0];
}

export async function getAllUsers() {
  const [rows] = await pool.query('SELECT * FROM users WHERE active = 1');
  return rows;
}

export async function createUser({ name, pin, email, role }) {
  const [result] = await pool.query('INSERT INTO users (name, pin, email, role, active) VALUES (?, ?, ?, ?, 1)', [name, pin, email, role]);
  return result.insertId;
}

export async function updateUser(id, updates) {
  const { name, pin, email, role, active } = updates;
  // Dynamic query building would be better, but fixed is fine for now
  // We'll update the fields provided
  let query = 'UPDATE users SET ';
  const params = [];
  const fields = [];
  
  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (pin !== undefined) { fields.push('pin = ?'); params.push(pin); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email); }
  if (role !== undefined) { fields.push('role = ?'); params.push(role); }
  if (active !== undefined) { fields.push('active = ?'); params.push(active ? 1 : 0); }

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

