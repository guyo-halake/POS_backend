import { createClient } from '@supabase/supabase-js';
import pool from '../database/db.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  console.log('Supabase Sync Engine initialized.');
} else {
  console.log('Supabase Sync Engine skipped: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

// Push local changes to Supabase
export async function pushSync() {
  if (!supabase) return;

  const tables = ['businesses', 'users', 'products', 'suppliers', 'sales', 'sale_items'];

  for (const table of tables) {
    try {
      const [unsynced] = await pool.query(`SELECT * FROM ${table} WHERE is_synced = 0`);
      
      if (unsynced.length > 0) {
        console.log(`Pushing ${unsynced.length} records from local ${table} to Supabase...`);
        
        // Remove is_synced and other local-only columns before pushing
        const recordsToPush = unsynced.map(record => {
            const { is_synced, location, last_active, ...rest } = record;
            return rest;
        });

        const { error } = await supabase.from(table).upsert(recordsToPush, { onConflict: 'id' });

        if (error) {
          console.error(`Error pushing to Supabase table ${table}:`, error);
        } else {
          // Mark as synced locally
          const ids = unsynced.map(r => r.id);
          // Use chunking if ids is very large, but fine for now
          await pool.query(`UPDATE ${table} SET is_synced = 1 WHERE id IN (?)`, [ids]);
          console.log(`Successfully synced ${table}.`);
        }
      }
    } catch (err) {
      console.error(`Sync error on table ${table}:`, err);
    }
  }
}

// Pull cloud changes from Supabase to local SQLite
export async function pullSync() {
  if (!supabase) return;

  const tables = [
    { name: 'businesses', columns: ['id', 'name', 'email', 'phone', 'location', 'logo', 'payment_config', 'mobile_app_requested', 'subscription_status', 'updated_at', 'created_at'] },
    { name: 'users', columns: ['id', 'name', 'pin', 'email', 'role', 'active', 'business_id', 'otp', 'otpExpires', 'updated_at', 'created_at'] },
    { name: 'products', columns: ['id', 'business_id', 'name', 'category', 'price', 'unit', 'stock', 'barcode', 'image', 'lowStockThreshold', 'updated_at', 'created_at'] },
    { name: 'suppliers', columns: ['id', 'business_id', 'name', 'phone', 'goods', 'updated_at', 'created_at'] },
    { name: 'sales', columns: ['id', 'business_id', 'total', 'paymentMethod', 'cashierId', 'cashierName', 'mpesaRef', 'updated_at', 'timestamp'] },
    { name: 'sale_items', columns: ['id', 'saleId', 'productId', 'productName', 'quantity', 'price', 'total', 'updated_at'] }
  ];

  console.log('Initiating Cloud Restore (pullSync) from Supabase...');

  for (const table of tables) {
    try {
      const { data: cloudRecords, error } = await supabase.from(table.name).select('*');
      if (error) throw error;
      
      if (!cloudRecords || cloudRecords.length === 0) continue;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        
        const placeholders = table.columns.map(() => '?').join(', ');
        const query = `INSERT OR IGNORE INTO ${table.name} (${table.columns.join(', ')}, is_synced) VALUES (${placeholders}, 1)`;
        
        for (const record of cloudRecords) {
           const values = table.columns.map(col => record[col] !== undefined ? record[col] : null);
           await connection.query(query, values);
        }
        
        await connection.commit();
      } catch (e) {
        await connection.rollback();
        console.error(`Failed to restore table ${table.name}:`, e);
      } finally {
        connection.release();
      }
    } catch (err) {
      console.error(`Error pulling from Supabase table ${table.name}:`, err);
    }
  }
  console.log('Cloud Restore complete.');
}

// Start background sync loop
export function startSyncEngine() {
  if (!supabase) return;
  
  // Run every 10 seconds
  setInterval(async () => {
    await pushSync();
  }, 10000);

  // Initial sync
  pushSync();
}
