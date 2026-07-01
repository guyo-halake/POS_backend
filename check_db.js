import pool from './database/db.js';

async function check() {
  try {
    const [businesses] = await pool.query('SELECT id, name FROM businesses');
    const [sales] = await pool.query('SELECT COUNT(*) as c FROM sales');
    const [receipts] = await pool.query('SELECT COUNT(*) as c FROM sale_items');
    const [products] = await pool.query('SELECT business_id, COUNT(*) as c FROM products GROUP BY business_id');
    
    console.log("=== DATABASE STATS ===");
    console.log("Total Businesses:", businesses.length);
    businesses.forEach(b => console.log(` - ${b.name} (ID: ${b.id})`));
    
    console.log("\nTotal Sales Recorded:", sales[0].c);
    console.log("Total Sale Items (Receipt lines):", receipts[0].c);
    
    console.log("\nProducts by Business:");
    products.forEach(p => console.log(` - Business ${p.business_id}: ${p.c} products`));
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
check();
