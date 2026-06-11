import express from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const reportsDir = path.join(__dirname, '../data/reports');

// Ensure reports directory exists
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

// Generate PDF Report using PDFKit
export function generatePDFReport(data, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 40,
        size: 'A4'
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Styles & Colors (Zinc / High Contrast)
      const primaryColor = '#000000';
      const secondaryColor = '#52525b'; // zinc-600
      const accentColor = '#10b981'; // emerald-500
      const borderColor = '#e4e4e7'; // zinc-200
      const lightBg = '#f4f4f5'; // zinc-100

      // Header Block
      doc.rect(40, 40, 515, 60).fill(lightBg);
      doc.fillColor(primaryColor);
      doc.fontSize(18).font('Helvetica-Bold').text('FRESH FITY SUPERMARKET', 55, 52);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(secondaryColor).text(
        `SUPERVISOR SYSTEM REPORT  |  PERIOD: ${data.metadata.period_label.toUpperCase()}`, 
        55, 78
      );

      // Metadata on top right
      const nowStr = new Date(data.metadata.timestamp).toLocaleString();
      doc.fontSize(8).font('Helvetica').text(`Generated: ${nowStr}`, 380, 52, { align: 'right', width: 160 });
      doc.text('Status: Official Records', 380, 65, { align: 'right', width: 160 });

      let y = 120;

      // 4-Grid KPI Layout
      const colWidth = 245;
      const rowHeight = 65;

      // Card 1: Revenue
      doc.rect(40, y, colWidth, rowHeight).strokeColor(borderColor).lineWidth(1).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor(secondaryColor).text('TOTAL REVENUE', 50, y + 10);
      doc.fontSize(18).font('Helvetica-Bold').fillColor(primaryColor).text(`KES ${data.metrics.total_sales.toLocaleString()}`, 50, y + 24);
      doc.fontSize(8).font('Helvetica').fillColor(accentColor).text(data.metrics.comparison_text, 50, y + 46);

      // Card 2: Net Profit
      doc.rect(295, y, colWidth, rowHeight).strokeColor(borderColor).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor(secondaryColor).text('ESTIMATED NET PROFIT', 305, y + 10);
      doc.fontSize(18).font('Helvetica-Bold').fillColor(accentColor).text(`KES ${data.metrics.total_profits.toLocaleString()}`, 305, y + 24);
      doc.fontSize(8).font('Helvetica').fillColor(secondaryColor).text('Revenue minus COGS and Expenses', 305, y + 46);

      y += rowHeight + 15;

      // Card 3: Cash & MPesa Breakdown
      doc.rect(40, y, colWidth, rowHeight).strokeColor(borderColor).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor(secondaryColor).text('PAYMENT BREAKDOWN', 50, y + 10);
      doc.fontSize(10).font('Helvetica').fillColor(primaryColor).text(`Cash Sales: KES ${data.metrics.cash_sales.toLocaleString()}`, 50, y + 26);
      doc.text(`M-Pesa Sales: KES ${data.metrics.mpesa_sales.toLocaleString()}`, 50, y + 40);

      // Card 4: Expenses & Refunds
      doc.rect(295, y, colWidth, rowHeight).strokeColor(borderColor).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor(secondaryColor).text('EXPENSES & VOIDS', 305, y + 10);
      doc.fontSize(10).font('Helvetica').fillColor(primaryColor).text(`Logged Expenses: KES ${data.metrics.total_expenses.toLocaleString()}`, 305, y + 26);
      doc.text(`Voids/Refunds: KES ${data.metrics.refund_sales.toLocaleString()} (${data.metrics.refund_count} receipts)`, 305, y + 40);

      y += rowHeight + 25;

      // Two Column Inventory List
      doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text('TOP SELLING PRODUCTS', 40, y);
      doc.text('SLOW-MOVING & LOW STOCK ITEMS', 295, y);
      
      doc.moveTo(40, y + 12).lineTo(270, y + 12).strokeColor(primaryColor).lineWidth(1.5).stroke();
      doc.moveTo(295, y + 12).lineTo(540, y + 12).stroke();

      y += 20;
      
      // Top Products list
      let tempY = y;
      if (data.top_products.length === 0) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor(secondaryColor).text('No transactions recorded during this period.', 40, tempY);
      } else {
        data.top_products.slice(0, 5).forEach((p, idx) => {
          doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text(`${idx + 1}. ${p.name}`, 40, tempY);
          doc.fontSize(8).font('Helvetica').fillColor(secondaryColor).text(
            `Qty Sold: ${p.quantity}  |  Revenue: KES ${p.revenue.toLocaleString()}`, 
            40, tempY + 12
          );
          tempY += 28;
        });
      }

      // Slow & Low Stock list
      tempY = y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text('Low Stock warnings:', 295, tempY);
      tempY += 14;
      if (data.low_stock.length === 0) {
        doc.fontSize(8).font('Helvetica').fillColor(secondaryColor).text('• No items below threshold.', 295, tempY);
        tempY += 12;
      } else {
        data.low_stock.slice(0, 3).forEach(item => {
          doc.fontSize(8).font('Helvetica').fillColor(primaryColor).text(
            `• ${item.name} (Stock: ${item.stock} left | Min: ${item.threshold})`, 295, tempY
          );
          tempY += 12;
        });
      }

      tempY += 10;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text('Slow-moving items in stock:', 295, tempY);
      tempY += 14;
      if (data.slow_products.length === 0) {
        doc.fontSize(8).font('Helvetica').fillColor(secondaryColor).text('• No slow items recorded.', 295, tempY);
      } else {
        data.slow_products.slice(0, 3).forEach(item => {
          doc.fontSize(8).font('Helvetica').fillColor(primaryColor).text(
            `• ${item.name} (Stock: ${item.stock} | Price: KES ${item.price})`, 295, tempY
          );
          tempY += 12;
        });
      }

      y = Math.max(tempY, y + 140) + 15;

      // Cashier & Audit stats
      doc.rect(40, y, 500, 30).fill(lightBg);
      doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text(
        `PERFORMANCE SUMMARY: Best Performing Cashier: ${data.best_cashier.name} (Volume: KES ${data.best_cashier.revenue.toLocaleString()})`,
        50, y + 10
      );

      y += 45;

      // AI Insights & Recommendations
      doc.fontSize(10).font('Helvetica-Bold').fillColor(primaryColor).text('AI INSIGHTS & STRATEGIC RECOMMENDATIONS', 40, y);
      doc.moveTo(40, y + 12).lineTo(540, y + 12).strokeColor(primaryColor).stroke();

      y += 20;

      // Clean formatted text parser
      const cleanInsights = data.insights_text
        .replace(/### RETAIL INSIGHTS/g, '')
        .replace(/### RECOMMENDATIONS/g, '')
        .trim();
        
      doc.fontSize(8.5).font('Helvetica').fillColor(secondaryColor).text(
        cleanInsights, 
        40, y, 
        { lineGap: 4, width: 500 }
      );

      // Page Footer
      doc.strokeColor(borderColor).lineWidth(0.5).moveTo(40, 770).lineTo(540, 770).stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor(secondaryColor).text(
        'Fresh Fity Supermarket POS Systems', 40, 780
      );
      doc.fontSize(8).font('Helvetica').text(
        'Designed & Integrated by P3L Technology Group', 40, 780, { align: 'right', width: 500 }
      );

      doc.end();

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

// Mail Dispatch Helper
export async function emailReport(pdfPath, rangeLabel, recipientEmail) {
  const user = process.env.EMAIL_USER || process.env.SMTP_EMAIL;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    throw new Error('SMTP credentials not configured. Please set EMAIL_USER and EMAIL_PASS in .env');
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail', // Standard gmail auth
    auth: {
      user: user,
      pass: pass
    }
  });

  const mailOptions = {
    from: `"Fresh Fity POS System" <${user}>`,
    to: recipientEmail || user,
    subject: `[Fresh Fity POS] Store Performance Summary (${rangeLabel})`,
    text: `Hello Supervisor,\n\nPlease find attached the official Store Performance & Sales Summary PDF report for the period: ${rangeLabel}.\n\nThis report contains aggregated transaction totals, profit estimates, expense records, cashier performance analytics, and smart retail recommendations.\n\nBest regards,\nFresh Fity POS Dispatch Engine.`,
    attachments: [
      {
        filename: path.basename(pdfPath),
        path: pdfPath
      }
    ]
  };

  return await transporter.sendMail(mailOptions);
}

// POST: Run Python script, generate PDF, and prepare WhatsApp summary
router.post('/generate', async (req, res) => {
  const { range, type, email } = req.body;
  const period = range || 'today';
  
  const scriptPath = path.join(__dirname, '../services/report_generator.py');
  const geminiKey = process.env.GEMINI_API_KEY || '';

  // Execute Python subprocess
  const python = spawn('python3', [
    scriptPath,
    `--range=${period}`,
    `--gemini-key=${geminiKey}`
  ]);

  let stdoutData = '';
  let stderrData = '';

  python.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  python.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  python.on('close', async (code) => {
    if (code !== 0) {
      console.error('Python script error:', stderrData);
      return res.status(500).json({ error: 'Report calculations failed', details: stderrData });
    }

    try {
      const parsedData = JSON.parse(stdoutData.trim());
      
      // Compile PDF
      const pdfFileName = `sales_report_${period}_${Date.now()}.pdf`;
      const pdfPath = path.join(reportsDir, pdfFileName);
      
      await generatePDFReport(parsedData, pdfPath);
      
      // Generate standard API URL for downloading PDF
      const hostUrl = process.env.API_URL || 'http://localhost:5001';
      const downloadUrl = `${hostUrl}/api/reports/download/${pdfFileName}`;
      
      // Append PDF download link to WhatsApp text
      parsedData.whatsapp_text += `\n📥 *Download Full PDF Report:* ${downloadUrl}`;
      parsedData.pdf_url = downloadUrl;

      // Handle Email Type
      if (type === 'email') {
        const recipient = email || process.env.SMTP_EMAIL;
        await emailReport(pdfPath, parsedData.metadata.period_label, recipient);
        parsedData.email_sent = true;
        parsedData.email_recipient = recipient;
      }

      res.json(parsedData);
    } catch (err) {
      console.error('Error processing python output:', err);
      res.status(500).json({ error: 'Failed to compile report details', details: err.message });
    }
  });
});

// GET: Serve static PDF files for download
router.get('/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(reportsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Report PDF not found.');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  fs.createReadStream(filePath).pipe(res);
});

export default router;
