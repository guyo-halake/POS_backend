import pool from './db.js';
import { initialUsers, initialProducts } from './seed_data.js';

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

    // Seed Users
    const [users] = await pool.query('SELECT COUNT(*) as count FROM users');
    if (users[0].count === 0) {
      console.log('Seeding initial users...');
      for (const user of initialUsers) {
        try {
          await pool.query(
            'INSERT INTO users (name, pin, email, role, active) VALUES (?, ?, ?, ?, 1)',
            [user.name, user.pin, user.email, user.role]
          );
        } catch (e) {
            console.log(`Skipping user ${user.name}: ${e.message}`);
        }
      }
      console.log('Users seeded successfully.');
    }

    // Seed Products
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products');
    if (products[0].count === 0) {
      console.log('Seeding initial products...');
      const connection = await pool.getConnection(); // Use transaction to batch
      try {
        await connection.beginTransaction();
        for (const product of initialProducts) {
          await connection.query(
            'INSERT INTO products (name, category, price, unit, stock, barcode, image, lowStockThreshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [product.name, product.category, product.price, product.unit, product.stock, product.barcode, product.image, product.lowStockThreshold]
          );
        }
        await connection.commit();
        console.log(`Seeded ${initialProducts.length} products successfully.`);
      } catch (err) {
        await connection.rollback();
        console.error('Failed to seed products:', err);
      } finally {
        connection.release();
      }
    }

    console.log('Database initialized: users and products tables ready.');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}
