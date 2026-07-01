import pool from './database/db.js';

async function check() {
    const [biz] = await pool.query('SELECT * FROM businesses');
    console.log(JSON.stringify(biz, null, 2));
    process.exit(0);
}
check();
