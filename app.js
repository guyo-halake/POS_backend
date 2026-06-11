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
import developerRouter from './routes/developer.js';
import reportsRouter from './routes/reports.js';
import expensesRouter from './routes/expenses.js';
import pool from './database/db.js';
import { initSalesTables } from './models/sale.js';
import { initDatabase } from './database/init.js';
import { startSyncEngine, pullSync } from './services/syncEngine.js';
import { spawn } from 'child_process';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(bodyParser.json());

// Global Active Session Tracker Middleware
app.use(async (req, res, next) => {
  const userId = req.headers['x-user-id'];
  if (userId) {
    try {
      await pool.query("UPDATE users SET last_active = datetime('now') WHERE id = ?", [userId]);
    } catch (e) {
      // Ignore tracking errors
    }
  }
  next();
});

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
app.use('/api/developer', developerRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/expenses', expensesRouter);

// Daily 9:30 PM Automated Closing Report Dispatcher
let lastCronRunDate = '';
setInterval(async () => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  
  // 9:30 PM is 21:30 local time
  if (now.getHours() === 21 && now.getMinutes() === 30 && lastCronRunDate !== dateStr) {
    lastCronRunDate = dateStr;
    console.log('[Scheduler] Running automated 9:30 PM Daily Sales Dispatch...');
    
    try {
      const scriptPath = path.join(__dirname, './services/report_generator.py');
      const geminiKey = process.env.GEMINI_API_KEY || '';
      
      const python = spawn('python3', [scriptPath, '--range=today', `--gemini-key=${geminiKey}`]);
      let output = '';
      
      python.stdout.on('data', (d) => { output += d.toString(); });
      python.on('close', async (code) => {
        if (code !== 0) return console.error('[Scheduler] Python report generation failed');
        
        try {
          const reportData = JSON.parse(output.trim());
          const reportsDir = path.join(__dirname, './data/reports');
          if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
          
          const pdfFileName = `sales_report_daily_cron_${Date.now()}.pdf`;
          const pdfPath = path.join(reportsDir, pdfFileName);
          
          const { generatePDFReport, emailReport } = await import('./routes/reports.js');
          await generatePDFReport(reportData, pdfPath);
          
          const recipient = process.env.EMAIL_USER || process.env.SMTP_EMAIL;
          if (recipient) {
            await emailReport(pdfPath, reportData.metadata.period_label, recipient);
            console.log(`[Scheduler] Daily sales dispatch email sent successfully to ${recipient}`);
          } else {
            console.warn('[Scheduler] EMAIL_USER is not configured. Automated dispatch email skipped.');
          }
        } catch (e) {
          console.error('[Scheduler] Failed to generate/email report', e);
        }
      });
    } catch (e) {
      console.error('[Scheduler] Dispatch crashed', e);
    }
  }
}, 30000);

// Initialize DB tables (Wrapped to prevent startup crash)
const startDb = async () => {
  try {
    await initDatabase(); // Init users/products
    await initSalesTables(); // Init sales/mpesa
    console.log('Database tables initialized');
    
    // Cloud Restore: Pull data from Supabase into local SQLite
    await pullSync();
    
    // Start background sync to Supabase
    startSyncEngine();
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
