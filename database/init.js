import pool from './db.js';

export async function initDatabase() {
  try {
    // Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        pin VARCHAR(10) NOT NULL UNIQUE,
        email VARCHAR(255),
        role VARCHAR(50) DEFAULT 'staff',
        active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Products Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        price DECIMAL(10, 2) NOT NULL,
        unit VARCHAR(20),
        stock INT DEFAULT 0,
        barcode VARCHAR(100),
        image TEXT,
        lowStockThreshold INT DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check if admin exists
    const [users] = await pool.query('SELECT * FROM users WHERE pin = ?', ['1111']);
    if (users.length === 0) {
      console.log('Seeding default admin user...');
      await pool.query(`
        INSERT INTO users (name, pin, email, role, active)
        VALUES ('Admin', '1111', 'admin@freshfity.com', 'admin', 1)
      `);
    }

    console.log('Database initialized: users and products tables ready.');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}
