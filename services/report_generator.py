import os
import sys
import sqlite3
import json
import urllib.request
from datetime import datetime

def load_env():
    # Attempt to load from .env file manually to avoid external dependencies
    env_vars = {}
    possible_paths = [
        os.path.join(os.getcwd(), '.env'),
        os.path.join(os.getcwd(), '..', '.env'),
        os.path.join(os.path.dirname(__file__), '.env'),
        os.path.join(os.path.dirname(__file__), '..', '.env'),
        os.path.join(os.path.dirname(__file__), '..', '..', '.env'),
    ]
    for path in possible_paths:
        if os.path.exists(path):
            with open(path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        env_vars[k.strip()] = v.strip().strip('"').strip("'")
            break
    return env_vars

def main():
    env = load_env()
    
    # Parse CLI Arguments
    period = 'today'
    db_path = env.get('SQLITE_PATH', '/home/razak/.local/share/p3l-pos/pos.db')
    gemini_key = env.get('GEMINI_API_KEY', '')

    for arg in sys.argv[1:]:
        if arg.startswith('--range='):
            period = arg.split('=')[1].lower()
        elif arg.startswith('--db='):
            db_path = arg.split('=')[1]
        elif arg.startswith('--gemini-key='):
            gemini_key = arg.split('=')[1]

    if not os.path.exists(db_path):
        print(json.dumps({"error": f"Database file not found at: {db_path}"}))
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Determine date filters
    # SQLite UTC conversion or localtime
    if period == 'today':
        date_filter = "DATE(timestamp, 'localtime') = DATE('now', 'localtime')"
        prev_date_filter = "DATE(timestamp, 'localtime') = DATE('now', '-1 day', 'localtime')"
        period_label = "Today"
    elif period == 'week':
        date_filter = "timestamp >= datetime('now', '-7 days', 'localtime')"
        prev_date_filter = "timestamp >= datetime('now', '-14 days', 'localtime') AND timestamp < datetime('now', '-7 days', 'localtime')"
        period_label = "This Week"
    elif period == 'month':
        date_filter = "timestamp >= datetime('now', '-30 days', 'localtime')"
        prev_date_filter = "timestamp >= datetime('now', '-60 days', 'localtime') AND timestamp < datetime('now', '-30 days', 'localtime')"
        period_label = "This Month"
    else:
        date_filter = "1=1"
        prev_date_filter = "0=1" # No comparison for all-time
        period_label = "All Time"

    try:
        # 1. Total Sales & Transactions
        cursor.execute(f"SELECT SUM(total) as revenue, COUNT(*) as tx_count FROM sales WHERE {date_filter}")
        sales_row = cursor.fetchone()
        total_sales = float(sales_row['revenue'] or 0.0)
        total_tx = int(sales_row['tx_count'] or 0)

        # Previous period sales for comparison
        cursor.execute(f"SELECT SUM(total) as revenue FROM sales WHERE {prev_date_filter}")
        prev_sales_row = cursor.fetchone()
        prev_sales = float(prev_sales_row['revenue'] or 0.0)

        # 2. Payment Method Breakdown
        cursor.execute(f"SELECT paymentMethod, SUM(total) as total FROM sales WHERE {date_filter} GROUP BY paymentMethod")
        payments = {row['paymentMethod'].lower(): float(row['total'] or 0) for row in cursor.fetchall()}
        cash_sales = payments.get('cash', 0.0)
        mpesa_sales = payments.get('mpesa', 0.0)

        # 3. Refunds & Voids (negative totals)
        cursor.execute(f"SELECT SUM(total) as refunded, COUNT(*) as r_count FROM sales WHERE {date_filter} AND total < 0")
        refund_row = cursor.fetchone()
        refund_sales = abs(float(refund_row['refunded'] or 0.0))
        refund_count = int(refund_row['r_count'] or 0)

        # 4. Expenses
        # Handle cases where expenses table might not have any data yet
        try:
            # Match date filter format for expenses
            cursor.execute(f"SELECT SUM(amount) as total FROM expenses WHERE {date_filter.replace('timestamp', 'timestamp')}")
            exp_row = cursor.fetchone()
            total_expenses = float(exp_row['total'] or 0.0)
        except Exception:
            total_expenses = 0.0

        # 5. COGS & Profit
        # join sale_items with products to get cost of goods sold. Fallback to 75% of sales price as cost if buying_price is empty.
        cursor.execute(f"""
            SELECT SUM(si.quantity * COALESCE(p.buying_price, p.price * 0.75)) as cogs
            FROM sale_items si
            JOIN products p ON si.productId = p.id
            JOIN sales s ON si.saleId = s.id
            WHERE {date_filter}
        """)
        cogs_row = cursor.fetchone()
        cogs = float(cogs_row['cogs'] or 0.0)
        # Net Profit = Revenue - COGS - Expenses
        # Avoid double-counting refund records which already reduce the total_sales
        total_profits = max(0.0, total_sales - cogs - total_expenses)

        # 6. Top Products
        limit = 5 if period == 'today' else 10
        cursor.execute(f"""
            SELECT productName, SUM(quantity) as sold, SUM(sale_items.total) as revenue
            FROM sale_items
            JOIN sales ON sale_items.saleId = sales.id
            WHERE {date_filter} AND sales.total >= 0
            GROUP BY productId, productName
            ORDER BY sold DESC
            LIMIT ?
        """, (limit,))
        top_products = [{"name": row['productName'], "quantity": float(row['sold']), "revenue": float(row['revenue'])} for row in cursor.fetchall()]

        # 7. Slow Moving Products
        cursor.execute(f"""
            SELECT name, stock, price 
            FROM products 
            WHERE id NOT IN (
                SELECT DISTINCT productId 
                FROM sale_items 
                JOIN sales ON sale_items.saleId = sales.id 
                WHERE {date_filter}
            )
            ORDER BY stock DESC
            LIMIT 5
        """)
        slow_products = [{"name": row['name'], "stock": int(row['stock']), "price": float(row['price'])} for row in cursor.fetchall()]

        # 8. Low Stock
        cursor.execute("SELECT name, stock, lowStockThreshold FROM products WHERE stock <= lowStockThreshold ORDER BY stock ASC LIMIT 5")
        low_stock = [{"name": row['name'], "stock": int(row['stock']), "threshold": int(row['lowStockThreshold'])} for row in cursor.fetchall()]

        # 9. Best Performing Cashier
        cursor.execute(f"""
            SELECT cashierName, SUM(total) as revenue, COUNT(*) as tx_count 
            FROM sales 
            WHERE {date_filter} AND total >= 0
            GROUP BY cashierId, cashierName 
            ORDER BY revenue DESC 
            LIMIT 1
        """)
        cashier_row = cursor.fetchone()
        if cashier_row and cashier_row['revenue'] is not None:
            best_cashier = {
                "name": cashier_row['cashierName'] or 'Unknown',
                "revenue": float(cashier_row['revenue']),
                "transactions": int(cashier_row['tx_count'])
            }
        else:
            best_cashier = {"name": "N/A", "revenue": 0.0, "transactions": 0}

    except Exception as e:
        print(json.dumps({"error": f"Database aggregation failed: {str(e)}"}))
        sys.exit(1)
    finally:
        conn.close()

    # Calculate Comparison Percentages
    sales_diff_pct = 0.0
    if prev_sales > 0:
        sales_diff_pct = round(((total_sales - prev_sales) / prev_sales) * 100, 2)
    elif total_sales > 0:
        sales_diff_pct = 100.0

    comparison_text = f"Sales up by {sales_diff_pct}% compared to previous period." if sales_diff_pct >= 0 else f"Sales down by {abs(sales_diff_pct)}% compared to previous period."
    if period == 'all':
        comparison_text = "All-time consolidated statistics."

    # Generate Rule-based default insights
    rule_insights = (
        f"• M-Pesa is driving {round((mpesa_sales / total_sales * 100) if total_sales > 0 else 0, 1)}% of total sales revenue.\n"
        f"• Net profit margin is approximately {round((total_profits / total_sales * 100) if total_sales > 0 else 0, 1)}% after expenses and inventory costs.\n"
        f"• The best cashier during this period was {best_cashier['name']}, processing KES {best_cashier['revenue']:,} in sales.\n"
        f"• Expenses total KES {total_expenses:,}, representing {round((total_expenses / total_sales * 100) if total_sales > 0 else 0, 1)}% of sales revenue."
    )
    
    rule_recommendations = (
        f"• Restock quickly: {', '.join([item['name'] for item in low_stock[:3]]) or 'No critical low stock alerts'}.\n"
        f"• Promote slow-moving inventory: {', '.join([item['name'] for item in slow_products[:3]]) or 'No slow inventory listed'}.\n"
        f"• Review operational expenses to ensure margins remain above 20%."
    )

    ai_text = ""
    # Call Gemini API if Key is present
    if gemini_key:
        prompt = f"""
        Act as an elite retail operations analyst. Write a highly analytical, concise, emoji-rich Daily/Weekly/Monthly Sales Summary and Insights report for "Fresh Fity Supermarket".
        
        Metrics:
        - Period: {period_label}
        - Total Sales Revenue: KES {total_sales:,.2f}
        - Transaction Volume: {total_tx} transactions
        - Estimated Net Profit: KES {total_profits:,.2f}
        - Total Expenses Logged: KES {total_expenses:,.2f}
        - Payment Breakdown: Cash: KES {cash_sales:,.2f} | M-Pesa: KES {mpesa_sales:,.2f}
        - Refunds/Voids processed: KES {refund_sales:,.2f} ({refund_count} voided receipts)
        - Top Products: {json.dumps(top_products[:5])}
        - Slow Inventory: {json.dumps(slow_products[:3])}
        - Low Stock Items: {json.dumps(low_stock[:3])}
        - Top Cashier Performance: {json.dumps(best_cashier)}
        - Period comparison: {comparison_text}

        Create the report with:
        1. BUSINESS HEALTH CHECK: A powerful 1-2 sentence executive assessment.
        2. RETAIL INSIGHTS: Exactly 3 sharp, data-driven bullet points explaining trends, payment patterns, average ticket size, profit margins, or comparison stats.
        3. STRATEGIC RECOMMENDATIONS: Exactly 3 highly specific actions for inventory restocking, sales growth, or expense management.

        Do NOT use markdown headers like h1/h2/h3. Format as clean text paragraphs with bullet points. Avoid mentioning standard developer jargon.
        """
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
        headers = {'Content-Type': 'application/json'}
        data = {
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }]
        }
        
        try:
            req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                ai_text = res_data['candidates'][0]['content']['parts'][0]['text']
        except Exception as e:
            ai_text = f"Warning: AI report generation failed ({str(e)}). Falling back to basic metrics.\n\n### RETAIL INSIGHTS\n{rule_insights}\n\n### RECOMMENDATIONS\n{rule_recommendations}"
    else:
        ai_text = f"### RETAIL INSIGHTS\n{rule_insights}\n\n### RECOMMENDATIONS\n{rule_recommendations}"

    # Construct WhatsApp Message Text
    whatsapp_msg = (
        f"📊 *FRESH FITY SUPERMARKET - SALES SUMMARY*\n"
        f"📅 *Period:* {period_label} ({datetime.now().strftime('%d %b %Y, %I:%M %p')})\n"
        f"----------------------------------------\n"
        f"💰 *Total Revenue:* KES {total_sales:,.2f}\n"
        f"📈 *Estimated Net Profit:* KES {total_profits:,.2f}\n"
        f"🧾 *Total Transactions:* {total_tx}\n"
        f"💵 *Cash Sales:* KES {cash_sales:,.2f}\n"
        f"📱 *M-Pesa Sales:* KES {mpesa_sales:,.2f}\n"
        f"💸 *Total Expenses:* KES {total_expenses:,.2f}\n"
        f"🔄 *Refunds/Voids:* KES {refund_sales:,.2f} ({refund_count} voided)\n"
        f"----------------------------------------\n"
        f"🏆 *Top Product:* {top_products[0]['name'] if top_products else 'N/A'} ({int(top_products[0]['quantity']) if top_products else 0} sold)\n"
        f"👤 *Best Cashier:* {best_cashier['name']} (KES {best_cashier['revenue']:,.2f})\n"
        f"📊 *Trend:* {comparison_text}\n"
        f"----------------------------------------\n"
        f"🔍 *AI INSIGHTS & RECOMMENDATIONS:*\n"
        f"{ai_text.strip()}\n"
        f"----------------------------------------\n"
        f"Developed by P3L Technology Group"
    )

    # Output full JSON response to stdout
    report_output = {
        "metadata": {
            "period": period,
            "period_label": period_label,
            "timestamp": datetime.now().isoformat(),
            "business_name": "Fresh Fity Supermarket"
        },
        "metrics": {
            "total_sales": total_sales,
            "total_transactions": total_tx,
            "total_profits": total_profits,
            "total_expenses": total_expenses,
            "cash_sales": cash_sales,
            "mpesa_sales": mpesa_sales,
            "refund_sales": refund_sales,
            "refund_count": refund_count,
            "sales_diff_pct": sales_diff_pct,
            "comparison_text": comparison_text
        },
        "top_products": top_products,
        "slow_products": slow_products,
        "low_stock": low_stock,
        "best_cashier": best_cashier,
        "insights_text": ai_text.strip(),
        "whatsapp_text": whatsapp_msg
    }
    
    print(json.dumps(report_output, indent=2))

if __name__ == '__main__':
    main()
