import pool from '../database/db.js';

// Get all sales with items
export async function getAllSales(businessId) {
  const bizId = businessId || '11111111-1111-1111-1111-111111111111';
  let query = 'SELECT * FROM sales WHERE business_id = ? ORDER BY timestamp DESC';
  const params = [bizId];
  const [sales] = await pool.query(query, params);
  
  if (sales.length === 0) return [];

  const saleIds = sales.map(s => s.id);
  // Need to handle large number of IDs if necessary, but this is fine for now
  const [items] = await pool.query('SELECT * FROM sale_items WHERE saleId IN (?)', [saleIds]);
  
  // Attach items to sales
  return sales.map(sale => ({
    ...sale,
    items: items.filter(item => item.saleId === sale.id).map(item => ({
      quantity: item.quantity,
      product: {
        id: item.productId,
        name: item.productName,
        price: item.price
      }
    }))
  }));
}

// Get dashboard stats
export async function getDashboardStats(businessId, range = 'today') {
  const connection = await pool.getConnection();
  try {
    let dateFilter;
    
    if (range === 'today') {
      dateFilter = 'DATE(timestamp) = CURDATE()';
    } else if (range === 'week') {
      dateFilter = 'timestamp >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
    } else if (range === 'month') {
      dateFilter = 'timestamp >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    } else if (range === 'year') {
      dateFilter = 'timestamp >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
    } else {
      dateFilter = '1=1';
    }

    const bizFilter = businessId ? `business_id = ? AND ` : '';
    const params = businessId ? [businessId] : [];

    // Total Sales & True Profit
    // Use subquery for profit to avoid duplicating s.total when a sale has multiple items
    const [salesResult] = await connection.query(`
      SELECT 
        SUM(s.total) as total, 
        COUNT(s.id) as count,
        (
          SELECT SUM((si.price - COALESCE(p.buying_price, 0)) * si.quantity)
          FROM sale_items si
          LEFT JOIN products p ON si.productId = p.id
          WHERE si.saleId IN (SELECT id FROM sales s2 WHERE ${bizFilter.replace('business_id', 's2.business_id')}${dateFilter.replace('timestamp', 's2.timestamp')})
        ) as trueProfit
      FROM sales s
      WHERE ${bizFilter.replace('business_id', 's.business_id')}${dateFilter.replace('timestamp', 's.timestamp')}
    `, [...params, ...params]);
    // Payment Methods
    const [paymentResult] = await connection.query(`
      SELECT paymentMethod, SUM(total) as total, COUNT(*) as count 
      FROM sales WHERE ${bizFilter}${dateFilter} 
      GROUP BY paymentMethod
    `, params);

    // Top Selling Products
    const [topProducts] = await connection.query(`
      SELECT productName, SUM(quantity) as sold, SUM(price * quantity) as revenue 
      FROM sale_items 
      JOIN sales ON sale_items.saleId = sales.id 
      WHERE ${bizFilter ? 'sales.business_id = ? AND ' : ''}${dateFilter.replace('timestamp', 'sales.timestamp')}
      GROUP BY productId, productName 
      ORDER BY sold DESC 
      LIMIT 10
    `, params);

    return {
      totalRevenue: salesResult[0].total || 0,
      totalCount: salesResult[0].count || 0,
      totalProfit: salesResult[0].trueProfit || 0,
      payments: paymentResult,
      topProducts
    };

  } finally {
    connection.release();
  }
}

// Create a new sale
export async function createSale(sale, businessId = 'default_business') {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id, total, paymentMethod, cashierId, cashierName, mpesaRef, items } = sale;

    // Insert into sales table
    await connection.query(
      'INSERT INTO sales (id, business_id, total, paymentMethod, cashierId, cashierName, mpesaRef, is_synced, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)',
      [id, businessId, total, paymentMethod, cashierId, cashierName, mpesaRef]
    );

    // Insert items
    const { v4: uuidv4 } = await import('uuid');
    for (const item of items) {
      await connection.query(
        'INSERT INTO sale_items (id, saleId, productId, productName, quantity, price, total, is_synced, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)',
        [uuidv4(), id, item.product.id, item.product.name, item.quantity, item.product.price, item.product.price * item.quantity]
      );
    }

    await connection.commit();
    return id;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// Helper to init tables (can be called once)
export async function initSalesTables() {
  const createSales = `
    CREATE TABLE IF NOT EXISTS sales (
      id VARCHAR(50) PRIMARY KEY,
      business_id TEXT DEFAULT 'default_business',
      total DECIMAL(10, 2) NOT NULL,
      paymentMethod VARCHAR(20),
      cashierId VARCHAR(50),
      cashierName VARCHAR(100),
      mpesaRef VARCHAR(50),
      is_synced INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  const createItems = `
    CREATE TABLE IF NOT EXISTS sale_items (
      id VARCHAR(50) PRIMARY KEY,
      saleId VARCHAR(50),
      productId VARCHAR(50),
      productName VARCHAR(255),
      quantity DECIMAL(10, 2),
      price DECIMAL(10, 2),
      total DECIMAL(10, 2),
      is_synced INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (saleId) REFERENCES sales(id) ON DELETE CASCADE
    )
  `;

  const createMpesa = `
    CREATE TABLE IF NOT EXISTS mpesa_transactions (
      checkoutRequestID VARCHAR(100) PRIMARY KEY,
      merchantRequestID VARCHAR(100),
      status VARCHAR(20) DEFAULT 'PENDING',
      resultCode INT,
      resultDesc VARCHAR(255),
      mpesaReceiptNumber VARCHAR(50),
      amount DECIMAL(10, 2),
      phoneNumber VARCHAR(20),
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  await pool.query(createSales);
  await pool.query(createItems);
  await pool.query(createMpesa);
}
