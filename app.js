import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import productsRouter from './routes/products.js';
import usersRouter from './routes/users.js';
import salesRouter from './routes/sales.js';
import mpesaRouter from './routes/mpesaRoutes.js';
import { initSalesTables } from './models/sale.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

app.use('/api/products', productsRouter);
app.use('/api/users', usersRouter);
app.use('/api/sales', salesRouter);
app.use('/api/mpesa', mpesaRouter);

// Initialize DB tables
initSalesTables().then(() => console.log('Sales tables initialized')).catch(console.error);

// Serve static files from the React frontend app
const frontendPath = path.join(__dirname, '../freshfity-pos-connect/dist');
app.use(express.static(frontendPath));

// Anything that doesn't match the above, send back index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  // Server started. Use a logging service here for production if needed.
});
