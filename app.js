import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import productsRouter from './routes/products.js';
import usersRouter from './routes/users.js';
import salesRouter from './routes/sales.js';
import mpesaRouter from './routes/mpesaRoutes.js';
import paystackRouter from './routes/paystackRoutes.js';
import auditLogsRouter from './routes/auditLogs.js';
import { initSalesTables } from './models/sale.js';
import { initDatabase } from './database/init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(bodyParser.json());

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/products', productsRouter);
app.use('/api/users', usersRouter);
app.use('/api/sales', salesRouter);
app.use('/api/mpesa', mpesaRouter);
app.use('/api/paystack', paystackRouter);
app.use('/api/audit-logs', auditLogsRouter);

// Initialize DB tables (Wrapped to prevent startup crash)
const startDb = async () => {
  try {
    await initDatabase(); // Init users/products
    await initSalesTables(); // Init sales/mpesa
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Failed to initialize database tables:', err);
    // We do NOT exit the process, allowing health check to work
  }
};
startDb();

// Serve static files from the React frontend app if available (for local monorepo dev)
// In Vercel production, frontend is deployed separately
const frontendPath = path.join(__dirname, '../freshfity-pos-connect/dist');
try {
    app.use(express.static(frontendPath));
    app.get('*', (req, res) => {
        // Only serve index.html if it's not an API request from the static folder
        if (!req.path.startsWith('/api')) {
             res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
                 if (err) res.status(404).send('Frontend not found (Running in API Mode)');
             });
        }
    });
} catch (e) {
    console.log('Frontend dist not found, running as pure API');
}

// Export the app (Required for Vercel)
export default app;

// Start the server only if run directly (node app.js)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
}
