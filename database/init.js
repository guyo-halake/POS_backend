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

    // Businesses Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        subscription_status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure default business exists
    const [biz] = await pool.query('SELECT * FROM businesses WHERE id = 1');
    if (biz.length === 0) {
      await pool.query('INSERT INTO businesses (id, name, email) VALUES (1, "Fresh Fity Supermarket", "admin@freshfity.com")');
      console.log('Default Business (Fresh Fity) created.');
    }

    // Suppliers Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        business_id INT,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        goods TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    // Sales Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id VARCHAR(50) PRIMARY KEY,
        business_id INT,
        cashier_id INT,
        cashier_name VARCHAR(255),
        total DECIMAL(10, 2),
        payment_method VARCHAR(50),
        mpesa_ref VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        synced BOOLEAN DEFAULT 1,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    // Sale Items Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sale_id VARCHAR(50),
        product_id INT,
        product_name VARCHAR(255),
        quantity INT,
        price DECIMAL(10, 2),
        total DECIMAL(10, 2),
        FOREIGN KEY (sale_id) REFERENCES sales(id)
      )
    `);

    // Audit Logs Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        user_name VARCHAR(255),
        action VARCHAR(255),
        details TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Column Migration Helper
    const addColumn = async (table, column, definition) => {
      try {
        await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        console.log(`Added ${column} to ${table}`);
      } catch (e) {
        if (!e.message.includes("Duplicate column")) {
          console.log(`Note for ${table}.${column}: ${e.message}`);
        }
      }
    };

    await addColumn('users', 'business_id', 'INT DEFAULT 1');
    await addColumn('products', 'business_id', 'INT DEFAULT 1');
    
    // Seed Users
    console.log('Ensuring all initial users exist...');
    for (const user of initialUsers) {
      try {
        const [existing] = await pool.query('SELECT id FROM users WHERE pin = ?', [user.pin]);
        if (existing.length === 0) {
          await pool.query(
            'INSERT INTO users (name, pin, email, role, active) VALUES (?, ?, ?, ?, 1)',
            [user.name, user.pin, user.email, user.role]
          );
          console.log(`User ${user.name} created.`);
        }
      } catch (e) {
          console.log(`Error checking/creating user ${user.name}: ${e.message}`);
      }
    }
    console.log('User seeding check complete.');

    // Seed Products
    const [products] = await pool.query('SELECT COUNT(*) as count FROM products');
    if (products[0].count === 0) {
      console.log('Seeding initial products...');
      const connection = await pool.getConnection(); // Use transaction to batch
      try {
        await connection.beginTransaction();
        for (const product of initialProducts) {
          // Hardcode business_id = 1 for initial seed
          await connection.query(
            'INSERT INTO products (business_id, name, category, price, unit, stock, barcode, image, lowStockThreshold) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)',
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
