import fetch from 'node-fetch';

async function testPut() {
    const res = await fetch('http://localhost:5001/api/users/admin-001', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            business: {
                id: '11111111-1111-1111-1111-111111111111',
                uiSettings: {},
                receiptSettings: { supermarketName: 'FRESH TEST' },
                paymentMng: {},
                paymentGateway: {}
            }
        })
    });
    console.log(await res.json());
}
testPut();
