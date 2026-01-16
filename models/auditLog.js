import pool from '../database/db.js';

export async function createLog(userId, userName, action, details) {
  try {
    const [result] = await pool.query(
      'INSERT INTO audit_logs (user_id, user_name, action, details) VALUES (?, ?, ?, ?)',
      [userId, userName, action, typeof details === 'object' ? JSON.stringify(details) : details]
    );
    return result.insertId;
  } catch (err) {
    console.error('Failed to create audit log:', err);
    return null;
  }
}

export async function getLogs(limit = 100) {
  try {
    const [rows] = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?', [limit]);
    return rows;
  } catch (err) {
    console.error('Failed to fetch audit logs:', err);
    throw err;
  }
}
