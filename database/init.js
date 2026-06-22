import pool from './db.js';
import { initialUsers, initialProducts } from './seed_data.js';

export async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        location TEXT,
        logo TEXT,
        payment_config TEXT,
        mobile_app_requested INTEGER DEFAULT 0,
        subscription_status TEXT DEFAULT 'active',
        is_synced INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pin TEXT NOT NULL UNIQUE,
        email TEXT,
        role TEXT DEFAULT 'staff',
        active INTEGER DEFAULT 1,
        business_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
        otp TEXT,
        otpExpires INTEGER,
        is_synced INTEGER DEFAULT 0,
        last_active TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    // Add location to existing businesses table if it doesn't exist
    try {
      await pool.query('ALTER TABLE businesses ADD COLUMN location TEXT');
    } catch (e) {
      // Ignore if column already exists
    }

    // Add last_active to existing users table if it doesn't exist
    try {
      await pool.query('ALTER TABLE users ADD COLUMN last_active TEXT');
    } catch (e) {
      // Ignore if column already exists
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        business_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
        name TEXT NOT NULL,
        category TEXT,
        price REAL NOT NULL,
        unit TEXT,
        stock INTEGER DEFAULT 0,
        barcode TEXT,
        image TEXT,
        lowStockThreshold INTEGER DEFAULT 10,
        is_synced INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        business_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        goods TEXT,
        is_synced INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    // Add email to existing suppliers table if it doesn't exist
    try {
      await pool.query('ALTER TABLE suppliers ADD COLUMN email TEXT');
    } catch (e) {
      // Ignore if column already exists
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        business_id TEXT DEFAULT '11111111-1111-1111-1111-111111111111',
        total REAL,
        paymentMethod TEXT,
        cashierId TEXT,
        cashierName TEXT,
        mpesaRef TEXT,
        is_synced INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        saleId TEXT,
        productId TEXT,
        productName TEXT,
        quantity REAL,
        price REAL,
        total REAL,
        is_synced INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
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
      CREATE TABLE IF NOT EXISTS email_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL,
        sender_name TEXT,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (business_id) REFERENCES businesses(id)
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

    // Create expenses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        amount REAL NOT NULL,
        category TEXT,
        description TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Try adding buying_price to products table
    try {
      await pool.query('ALTER TABLE products ADD COLUMN buying_price REAL DEFAULT 0.0');
      console.log('Added buying_price column to products table.');
    } catch (e) {
      // Column probably already exists, safe to ignore
    }

    const defaultBizId = '11111111-1111-1111-1111-111111111111';
    const [biz] = await pool.query('SELECT * FROM businesses WHERE id = ?', [defaultBizId]);
    if (biz.length === 0) {
      await pool.query('INSERT INTO businesses (id, name, email) VALUES (?, ?, ?)', [defaultBizId, 'Fresh Fity Supermarket', 'admin@freshfity.com']);
      console.log('Default Business (Fresh Fity) created.');
    }
    
    // Seed Users
    console.log('Ensuring all initial users exist...');
    for (const user of initialUsers) {
      try {
        const [existing] = await pool.query('SELECT id FROM users WHERE pin = ?', [user.pin]);
        if (existing.length === 0) {
          const { v4: uuidv4 } = await import('uuid');
          await pool.query(
            'INSERT INTO users (id, name, pin, email, role, active, business_id) VALUES (?, ?, ?, ?, ?, 1, ?)',
            [uuidv4(), user.name, user.pin, user.email, user.role, defaultBizId]
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
        const { v4: uuidv4 } = await import('uuid');
        for (const product of initialProducts) {
          await connection.query(
            'INSERT INTO products (id, business_id, name, category, price, unit, stock, barcode, image, lowStockThreshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), defaultBizId, product.name, product.category, product.price, product.unit, product.stock, product.barcode, product.image, product.lowStockThreshold]
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

    // Seed Email Templates
    const [templates] = await pool.query('SELECT COUNT(*) as count FROM email_templates');
    if (templates[0].count === 0) {
      console.log('Seeding initial email templates...');
      const { v4: uuidv4 } = await import('uuid');
      
      const welcomeTemplate = `<h3>Welcome {{Name}}!</h3><p>Your M-POS is ready.</p><p>You will receive daily sales summaries from this email. An online version of your POS is always available at <a href="https://p3lpos.vercel.app">https://p3lpos.vercel.app</a>. Feel free to use it.</p><p>Your manager PIN is: <strong>{{PIN}}</strong>. Please make sure you update and change your PIN.</p><p>Thank you,<br/>P3L Admin</p>`;
      
      const salesTemplate = `<p>Good evening {{Username}},</p><p>Today's sales reports are ready. Please log into your Developer Hub to download your complete summary PDF.</p><p>Thank you,<br/>P3L Admin</p>`;
      
      await pool.query(
        'INSERT INTO email_templates (id, name, subject, body) VALUES (?, ?, ?, ?)',
        [uuidv4(), 'First Time Login', 'Welcome to P3L POS', welcomeTemplate]
      );
      
      await pool.query(
        'INSERT INTO email_templates (id, name, subject, body) VALUES (?, ?, ?, ?)',
        [uuidv4(), 'Sales Dispatch', 'Your Daily Sales Summary', salesTemplate]
      );
      console.log('Seeded email templates successfully.');
    }

    console.log('Database initialized: tables ready and seeded.');
  } catch (error) {
    console.error('Database initialization failed:', error);
  }
}
