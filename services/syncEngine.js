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
        
        // Remove is_synced column before pushing
        const recordsToPush = unsynced.map(record => {
            const { is_synced, ...rest } = record;
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
