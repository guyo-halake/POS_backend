import pool from './database/db.js';

async function testUpdate() {
    try {
        const id = '11111111-1111-1111-1111-111111111111';
        const bizName = 'TEST NEW NAME';
        const paymentConfig = JSON.stringify({
            uiSettings: { theme: 'dark' },
            receiptSettings: { supermarketName: bizName, footerMessage: 'TEST' }
        });
        
        const [res] = await pool.query('UPDATE businesses SET payment_config = ?, name = ? WHERE id = ?', [paymentConfig, bizName, id]);
        console.log('Update result:', res);
        
        const [biz] = await pool.query('SELECT * FROM businesses WHERE id = ?', [id]);
        console.log('After update:', biz[0]);
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}
testUpdate();
