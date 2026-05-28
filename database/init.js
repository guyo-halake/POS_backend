import pool from './db.js';
import { initialUsers, initialProducts } from './seed_data.js';

export async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        logo TEXT,
        payment_config TEXT,
        mobile_app_requested INTEGER DEFAULT 0,
        subscription_status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pin TEXT NOT NULL UNIQUE,
        email TEXT,
        role TEXT DEFAULT 'staff',
        active INTEGER DEFAULT 1,
        business_id INTEGER DEFAULT 1,
        otp TEXT,
        otpExpires INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER DEFAULT 1,
        name TEXT NOT NULL,
        category TEXT,
        price REAL NOT NULL,
        unit TEXT,
        stock INTEGER DEFAULT 0,
        barcode TEXT,
        image TEXT,
        lowStockThreshold INTEGER DEFAULT 10,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_id INTEGER,
        name TEXT NOT NULL,
        phone TEXT,
        goods TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        business_id INTEGER DEFAULT 1,
        total REAL,
        paymentMethod TEXT,
        cashierId TEXT,
        cashierName TEXT,
        mpesaRef TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 1,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        saleId TEXT,
        productId INTEGER,
        productName TEXT,
        quantity REAL,
        price REAL,
        total REAL,
        FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS mpesa_transactions (
        checkoutRequestID TEXT PRIMARY KEY,
        merchantRequestID TEXT,
        status TEXT DEFAULT 'PENDING',
        resultCode INTEGER,
        resultDesc TEXT,
        mpesaReceiptNumber TEXT,
        amount REAL,
        phoneNumber TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        action TEXT,
        details TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [biz] = await pool.query('SELECT * FROM businesses WHERE id = 1');
    if (biz.length === 0) {
      await pool.query('INSERT INTO businesses (id, name, email) VALUES (1, ?, ?)', ['Fresh Fity Supermarket', 'admin@freshfity.com']);
      console.log('Default Business (Fresh Fity) created.');
    }
    
    // Seed Users
    console.log('Ensuring all initial users exist...');
    for (const user of initialUsers) {
      try {
        const [existing] = await pool.query('SELECT id FROM users WHERE pin = ?', [user.pin]);
        if (existing.length === 0) {
          await pool.query(
            'INSERT INTO users (name, pin, email, role, active, business_id) VALUES (?, ?, ?, ?, 1, 1)',
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
