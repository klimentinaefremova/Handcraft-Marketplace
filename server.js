const http = require('http');
const url = require('url');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

const port = process.env.PORT || 3000;

const sessions = new Map();
const verificationCodes = new Map();
const tempUsers = new Map();
const tempAdminSessions = new Map();
const tempStoreRegistrations = new Map();

console.log('🔧 Starting Handcraft Marketplace Server...');
console.log('🎨 Colors: Royal Blue & Pink Theme');

let emailTransporter;

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: (() => {
            const configuredPort = parseInt(process.env.SMTP_PORT, 10);
            if (process.env.SMTP_HOST === 'smtp.ethereal.email' && configuredPort === 3000) return 587;
            return configuredPort || 587;
        })(),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    };

    emailTransporter = nodemailer.createTransport(emailConfig);

    emailTransporter.verify(function(error, success) {
        if (error) {
            console.log('❌ Email configuration failed:', error.message);
            console.log('📧 Falling back to console display for verification codes');
            emailTransporter = createMockTransporter();
        } else {
            console.log('✅ Email server is ready to send real emails!');
        }
    });
} else {
    console.log('📧 No email credentials found. Verification codes will be shown in console.');
    emailTransporter = createMockTransporter();
}

function createMockTransporter() {
    return {
        sendMail: function(mailOptions) {
            return new Promise((resolve, reject) => {
                const codeMatch = mailOptions.html.match(/\b\d{6}\b/);
                const code = codeMatch ? codeMatch[0] : 'unknown';

                console.log('');
                console.log('🎯 ===== VERIFICATION CODE =====');
                console.log('📧 For:', mailOptions.to);
                console.log('🔐 CODE:', code);
                console.log('⏰ Expires in: 30 seconds');
                console.log('📝 Use this code to continue');
                console.log('================================');
                console.log('');

                resolve({ messageId: 'dev-' + Date.now() });
            });
        }
    };
}

function sendVerificationEmail(toEmail, code) {
    const mailOptions = {
        from: process.env.SMTP_USER || 'noreply@handcraft-marketplace.com',
        to: toEmail,
        subject: 'Your Verification Code - Handcraft Marketplace',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #4169E1 0%, #FF69B4 100%); color: white; padding: 20px; border-radius: 10px;">
            <h2 style="text-align: center;">🎨 Handcraft Marketplace</h2>
            <div style="background-color: white; color: #333; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #4169E1;">Account Verification</h3>
                <p>Your verification code is:</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #4169E1;">
                    ${code}
                </div>
                <p style="color: #e74c3c; font-weight: bold;">⚠️ This code will expire in 30 seconds</p>
                <p style="color: #666; font-size: 12px;">If you didn't request this verification, please ignore this email.</p>
            </div>
        </div>`
    };

    console.log('');
    console.log('🎯 ===== VERIFICATION CODE FOR TESTING =====');
    console.log('📧 Email:', toEmail);
    console.log('🔐 CODE:', code);
    console.log('⏰ Expires in: 30 seconds');
    console.log('==========================================');
    console.log('');

    return emailTransporter.sendMail(mailOptions);
}

function send2FACode(toEmail, code) {
    const mailOptions = {
        from: process.env.SMTP_USER || 'noreply@handcraft-marketplace.com',
        to: toEmail,
        subject: 'Your 2FA Code - Handcraft Marketplace',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #4169E1 0%, #FF69B4 100%); color: white; padding: 20px; border-radius: 10px;">
            <h2 style="text-align: center;">🎨 Handcraft Marketplace</h2>
            <div style="background-color: white; color: #333; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #4169E1;">Two-Factor Authentication</h3>
                <p>Your login verification code is:</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #4169E1;">
                    ${code}
                </div>
                <p style="color: #e74c3c; font-weight: bold;">⚠️ This code will expire in 30 seconds</p>
                <p style="color: #666; font-size: 12px;">If you're not trying to login, please secure your account immediately.</p>
            </div>
        </div>`
    };

    console.log('');
    console.log('🎯 ===== 2FA CODE FOR TESTING =====');
    console.log('📧 Email:', toEmail);
    console.log('🔐 CODE:', code);
    console.log('⏰ Expires in: 30 seconds');
    console.log('==================================');
    console.log('');

    return emailTransporter.sendMail(mailOptions);
}

function sendStoreRegistrationEmail(toEmail, code, storeName) {
    const mailOptions = {
        from: process.env.SMTP_USER || 'noreply@handcraft-marketplace.com',
        to: toEmail,
        subject: 'Store Registration Verification - Handcraft Marketplace',
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #4169E1 0%, #FF69B4 100%); color: white; padding: 20px; border-radius: 10px;">
            <h2 style="text-align: center;">🎨 Handcraft Marketplace</h2>
            <div style="background-color: white; color: #333; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #4169E1;">Store Registration Verification</h3>
                <p>Thank you for registering your store "<strong>${storeName}</strong>" on Handcraft Marketplace!</p>
                <p>Your verification code is:</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #4169E1;">
                    ${code}
                </div>
                <p style="color: #e74c3c; font-weight: bold;">⚠️ This code will expire in 30 seconds</p>
                <p style="color: #666; font-size: 12px;">If you didn't request this verification, please ignore this email.</p>
            </div>
        </div>`
    };

    console.log('');
    console.log('🎯 ===== STORE REGISTRATION VERIFICATION CODE =====');
    console.log('📧 For:', toEmail);
    console.log('🏪 Store:', storeName);
    console.log('🔐 CODE:', code);
    console.log('⏰ Expires in: 30 seconds');
    console.log('==================================================');
    console.log('');

    return emailTransporter.sendMail(mailOptions);
}

function generateVerificationCode() {
    let code = '';
    for(let i = 0; i < 6; i++) {
        code += crypto.randomInt(0, 10);
    }
    return code;
}

function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

function serveStaticFile(res, filePath, contentType) {
    const fullPath = path.join(__dirname, 'interfejs', filePath);
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            console.error('File not found:', fullPath, err);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
}

function parseCookies(req) {
    const cookieHeader = req.headers.cookie;
    const cookies = {};
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            cookies[parts[0].trim()] = parts[1]?.trim();
        });
    }
    return cookies;
}

function getClientIp(req) {
    return req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        (req.connection.socket ? req.connection.socket.remoteAddress : null);
}

function requireAuth(req, res, callback) {
    const cookies = parseCookies(req);
    const sessionId = cookies.sessionId;

    if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(302, { 'Location': '/login.html' });
        res.end();
        return;
    }

    const userId = sessions.get(sessionId);

    if (tempAdminSessions.has(sessionId)) {
        if (!req.url.includes('/change-password') && !req.url.includes('/api/force-change-password')) {
            res.writeHead(302, { 'Location': '/change-password.html?forced=true' });
            res.end();
            return;
        }
    }

    callback(userId);
}

function requireRole(roleName) {
    return function(req, res, callback) {
        requireAuth(req, res, (userId) => {
            database.getUserById(userId, (err, user) => {
                if (err || !user) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Access denied' }));
                    return;
                }

                const hasRole = user.roles && user.roles.some(role => role.name === roleName);

                if (!hasRole) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Insufficient permissions' }));
                    return;
                }

                callback(userId, user);
            });
        });
    };
}

function validateEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

function validatePassword(password) {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
}

function cleanupExpiredCodes() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, data] of verificationCodes.entries()) {
        if (now - data.timestamp > 30 * 1000) {
            verificationCodes.delete(key);
            cleanedCount++;
        }
    }

    for (const [key, data] of tempUsers.entries()) {
        if (now - data.timestamp > 30 * 1000) {
            tempUsers.delete(key);
            cleanedCount++;
        }
    }

    for (const [key, data] of tempStoreRegistrations.entries()) {
        if (now - data.timestamp > 30 * 1000) {
            tempStoreRegistrations.delete(key);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} expired verification codes`);
    }
}

setInterval(cleanupExpiredCodes, 10 * 1000);

function requireStoreOwner() {
    return function(req, res, callback) {
        requireAuth(req, res, (userId) => {
            const userIdStr = String(userId);

            // Check if this is the admin user (ID 000000)
            if (userIdStr === '000000') {
                // Admin is not a store owner
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Access denied - not a store owner' }));
                return;
            }

            // Check if it's a personal user
            if (userIdStr.startsWith('personal_')) {
                const personalId = userIdStr.replace('personal_', '');

                database.database.get(
                    'SELECT boss_id FROM boss WHERE boss_id = $1',
                    [personalId],
                    (err, boss) => {
                        if (err || !boss) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Access denied - not a store owner' }));
                            return;
                        }

                        callback(personalId);
                    }
                );
            } else {
                // Not a personal user, so not a store owner
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Access denied - not a store owner' }));
            }
        });
    };
}



const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
    port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
    user: process.env.PGUSER || process.env.DB_USER || 'postgres',
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.PGDATABASE || process.env.DB_NAME || 'handcraft_marketplace',
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30000
});

const transactionStorage = new AsyncLocalStorage();

function dbQuery(sql, params = [], callback) {
    const client = transactionStorage.getStore() || pool;

    client.query(sql, params)
        .then(result => callback(null, result))
        .catch(err => callback(err));
}

const REPORT_FUNCTIONS_SQL = String.raw`
-- ============================================================
-- HANDCRAFT MARKETPLACE REPORT FUNCTIONS
-- PostgreSQL / exact project schema
-- ============================================================

CREATE OR REPLACE FUNCTION get_orders_by_total()
RETURNS TABLE (
    order_num VARCHAR(11),
    client_id INTEGER,
    client_name TEXT,
    order_quantity BIGINT,
    order_status VARCHAR(20),
    payment_method VARCHAR(250),
    discount NUMERIC,
    order_total NUMERIC
)
LANGUAGE sql
AS $$
    SELECT
        o.order_num,
        o.client_id,
        CONCAT_WS(' ', c.first_name, c.last_name) AS client_name,
        COALESCE(SUM(i.quantity), 0)::BIGINT AS order_quantity,
        o.status,
        o.payment_method,
        COALESCE(o.discount, 0)::NUMERIC AS discount,
        ROUND(
            COALESCE(SUM(p.price * i.quantity), 0)
            * (1 - COALESCE(o.discount, 0) / 100.0),
            2
        ) AS order_total
    FROM "order" o
    LEFT JOIN client c ON c.client_id = o.client_id
    LEFT JOIN includes i ON i.order_num = o.order_num
    LEFT JOIN product p ON p.code = i.product_code
    GROUP BY
        o.order_num, o.client_id, c.first_name, c.last_name,
        o.status, o.payment_method, o.discount
    ORDER BY 8 DESC, o.order_num;
$$;

CREATE OR REPLACE FUNCTION get_products_by_total_sales()
RETURNS TABLE (
    product_code VARCHAR(8),
    product_description VARCHAR(500),
    product_price NUMERIC,
    number_of_orders BIGINT,
    total_quantity_sold BIGINT,
    total_revenue NUMERIC
)
LANGUAGE sql
AS $$
    SELECT
        p.code,
        p.description,
        p.price::NUMERIC,
        COUNT(DISTINCT i.order_num) AS number_of_orders,
        COALESCE(SUM(i.quantity), 0)::BIGINT AS total_quantity_sold,
        ROUND(
            COALESCE(
                SUM(
                    p.price * i.quantity
                    * (1 - COALESCE(o.discount, 0) / 100.0)
                ),
                0
            ),
            2
        ) AS total_revenue
    FROM product p
    LEFT JOIN includes i ON i.product_code = p.code
    LEFT JOIN "order" o ON o.order_num = i.order_num
    GROUP BY p.code, p.description, p.price
    ORDER BY 4 DESC, 5 DESC, 6 DESC;
$$;

CREATE OR REPLACE FUNCTION get_low_stock_high_demand_products(
    p_stock_threshold INTEGER,
    p_demand_threshold INTEGER
)
RETURNS TABLE (
    product_code VARCHAR(8),
    product_description VARCHAR(500),
    current_stock INTEGER,
    number_of_orders BIGINT,
    total_quantity_sold BIGINT
)
LANGUAGE sql
AS $$
    SELECT
        p.code,
        p.description,
        p.availability,
        COUNT(DISTINCT i.order_num),
        COALESCE(SUM(i.quantity), 0)::BIGINT
    FROM product p
    JOIN includes i ON i.product_code = p.code
    GROUP BY p.code, p.description, p.availability
    HAVING
        p.availability < p_stock_threshold
        AND COUNT(DISTINCT i.order_num) >= p_demand_threshold
    ORDER BY 4 DESC, 5 DESC, 3 ASC;
$$;

CREATE OR REPLACE FUNCTION get_products_monthly_sales()
RETURNS TABLE (
    product_code VARCHAR(8),
    product_description VARCHAR(500),
    year INTEGER,
    month INTEGER,
    number_of_orders BIGINT,
    total_quantity_sold BIGINT,
    total_revenue NUMERIC
)
LANGUAGE sql
AS $$
    SELECT
        p.code,
        p.description,
        EXTRACT(YEAR FROM o.last_date_mod)::INTEGER,
        EXTRACT(MONTH FROM o.last_date_mod)::INTEGER,
        COUNT(DISTINCT o.order_num),
        COALESCE(SUM(i.quantity), 0)::BIGINT,
        ROUND(
            COALESCE(
                SUM(
                    p.price * i.quantity
                    * (1 - COALESCE(o.discount, 0) / 100.0)
                ),
                0
            ),
            2
        )
    FROM product p
    JOIN includes i ON i.product_code = p.code
    JOIN "order" o ON o.order_num = i.order_num
    GROUP BY
        p.code, p.description,
        EXTRACT(YEAR FROM o.last_date_mod),
        EXTRACT(MONTH FROM o.last_date_mod)
    ORDER BY 3 DESC, 4 DESC, 7 DESC;
$$;

CREATE OR REPLACE FUNCTION get_stores_by_last_calendar_year_revenue()
RETURNS TABLE (
    store_id VARCHAR(3),
    store_name VARCHAR(50),
    number_of_orders BIGINT,
    total_quantity_sold BIGINT,
    total_revenue NUMERIC
)
LANGUAGE sql
AS $$
    SELECT
        s.store_id,
        s.name,
        COUNT(DISTINCT o.order_num),
        COALESCE(SUM(i.quantity), 0)::BIGINT,
        ROUND(
            COALESCE(
                SUM(
                    p.price * i.quantity
                    * (1 - COALESCE(o.discount, 0) / 100.0)
                ),
                0
            ),
            2
        )
    FROM store s
    LEFT JOIN sells se ON se.store_id = s.store_id
    LEFT JOIN product p ON p.code = se.product_code
    LEFT JOIN includes i ON i.product_code = p.code
    LEFT JOIN "order" o
        ON o.order_num = i.order_num
       AND o.last_date_mod >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '1 year'
       AND o.last_date_mod < DATE_TRUNC('year', CURRENT_DATE)
    GROUP BY s.store_id, s.name
    ORDER BY 5 DESC, s.store_id;
$$;

CREATE OR REPLACE FUNCTION get_products_never_ordered()
RETURNS TABLE (
    product_code VARCHAR(8),
    product_description VARCHAR(500),
    product_price NUMERIC,
    current_stock INTEGER
)
LANGUAGE sql
AS $$
    SELECT p.code, p.description, p.price::NUMERIC, p.availability
    FROM product p
    WHERE NOT EXISTS (
        SELECT 1
        FROM includes i
        WHERE i.product_code = p.code
    )
    ORDER BY p.code;
$$;

CREATE OR REPLACE FUNCTION get_products_by_number_of_orders()
RETURNS TABLE (
    product_code VARCHAR(8),
    product_description VARCHAR(500),
    product_price NUMERIC,
    number_of_orders BIGINT
)
LANGUAGE sql
AS $$
    SELECT
        p.code,
        p.description,
        p.price::NUMERIC,
        COUNT(DISTINCT i.order_num)
    FROM product p
    JOIN includes i ON i.product_code = p.code
    GROUP BY p.code, p.description, p.price
    ORDER BY 4 DESC, p.code;
$$;

CREATE OR REPLACE FUNCTION get_stores_by_average_review()
RETURNS TABLE (
    store_id VARCHAR(3),
    store_name VARCHAR(50),
    average_review NUMERIC,
    number_of_reviews BIGINT
)
LANGUAGE sql
AS $$
    WITH store_reviews AS (
        SELECT DISTINCT
            s.store_id,
            s.name AS store_name,
            r.order_num,
            r.rating
        FROM store s
        JOIN sells se ON se.store_id = s.store_id
        JOIN includes i ON i.product_code = se.product_code
        JOIN review r ON r.order_num = i.order_num
    )
    SELECT
        s.store_id,
        s.name,
        COALESCE(ROUND(AVG(sr.rating), 2), 0)::NUMERIC,
        COUNT(sr.order_num)
    FROM store s
    LEFT JOIN store_reviews sr ON sr.store_id = s.store_id
    GROUP BY s.store_id, s.name
    ORDER BY 3 DESC, s.store_id;
$$;

CREATE OR REPLACE FUNCTION get_store_with_highest_revenue_growth()
RETURNS TABLE (
    store_id VARCHAR(3),
    store_name VARCHAR(50),
    previous_year_revenue NUMERIC,
    last_year_revenue NUMERIC,
    revenue_growth NUMERIC
)
LANGUAGE sql
AS $$
    WITH store_years AS (
        SELECT
            s.store_id,
            s.name AS store_name,
            EXTRACT(YEAR FROM o.last_date_mod)::INTEGER AS sales_year,
            SUM(
                p.price * i.quantity
                * (1 - COALESCE(o.discount, 0) / 100.0)
            ) AS revenue
        FROM store s
        JOIN sells se ON se.store_id = s.store_id
        JOIN includes i ON i.product_code = se.product_code
        JOIN product p ON p.code = i.product_code
        JOIN "order" o ON o.order_num = i.order_num
        WHERE o.last_date_mod >= DATE_TRUNC('year', CURRENT_DATE) - INTERVAL '2 years'
          AND o.last_date_mod < DATE_TRUNC('year', CURRENT_DATE)
        GROUP BY s.store_id, s.name, EXTRACT(YEAR FROM o.last_date_mod)
    ),
    comparison AS (
        SELECT
            s.store_id,
            s.name AS store_name,
            COALESCE(MAX(CASE
                WHEN sy.sales_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 2
                THEN sy.revenue ELSE 0 END), 0) AS previous_year_revenue,
            COALESCE(MAX(CASE
                WHEN sy.sales_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1
                THEN sy.revenue ELSE 0 END), 0) AS last_year_revenue
        FROM store s
        LEFT JOIN store_years sy ON sy.store_id = s.store_id
        GROUP BY s.store_id, s.name
    )
    SELECT
        store_id,
        store_name,
        ROUND(previous_year_revenue, 2),
        ROUND(last_year_revenue, 2),
        ROUND(last_year_revenue - previous_year_revenue, 2)
    FROM comparison
    ORDER BY 5 DESC, store_id
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_clients_by_number_of_orders()
RETURNS TABLE (
    client_id INTEGER,
    client_name TEXT,
    number_of_orders BIGINT
)
LANGUAGE sql
AS $$
    SELECT
        c.client_id,
        CONCAT_WS(' ', c.first_name, c.last_name),
        COUNT(o.order_num)
    FROM client c
    JOIN "order" o ON o.client_id = c.client_id
    GROUP BY c.client_id, c.first_name, c.last_name
    ORDER BY 3 DESC, c.client_id;
$$;

CREATE OR REPLACE FUNCTION get_approximate_orders_per_client()
RETURNS TABLE (
    total_clients BIGINT,
    total_orders BIGINT,
    approximate_orders_per_client NUMERIC
)
LANGUAGE sql
AS $$
    SELECT
        (SELECT COUNT(*) FROM client),
        (SELECT COUNT(*) FROM "order"),
        ROUND(
            (SELECT COUNT(*)::NUMERIC FROM "order")
            / NULLIF((SELECT COUNT(*) FROM client), 0),
            2
        );
$$;

CREATE OR REPLACE FUNCTION get_clients_without_orders()
RETURNS TABLE (
    client_id INTEGER,
    client_name TEXT,
    email VARCHAR(50)
)
LANGUAGE sql
AS $$
    SELECT
        c.client_id,
        CONCAT_WS(' ', c.first_name, c.last_name),
        c.email
    FROM client c
    WHERE NOT EXISTS (
        SELECT 1 FROM "order" o WHERE o.client_id = c.client_id
    )
    ORDER BY c.client_id;
$$;

CREATE OR REPLACE FUNCTION get_store_request_statistics()
RETURNS TABLE (
    store_id VARCHAR(3),
    store_name VARCHAR(50),
    total_requests BIGINT,
    solved_requests BIGINT,
    requests_in_progress BIGINT
)
LANGUAGE sql
AS $$
    SELECT
        s.store_id,
        s.name,
        COUNT(r.request_num),
        COUNT(r.request_num) FILTER (WHERE r.customer_satisfaction > 0),
        COUNT(r.request_num) FILTER (WHERE r.customer_satisfaction <= 0)
    FROM store s
    LEFT JOIN for_store fs ON fs.store_id = s.store_id
    LEFT JOIN request r ON r.request_num = fs.request_num
    GROUP BY s.store_id, s.name
    ORDER BY 3 DESC, s.store_id;
$$;

CREATE OR REPLACE FUNCTION get_top_10_employees_by_requests_last_month()
RETURNS TABLE (
    employee_id VARCHAR(10),
    employee_name TEXT,
    number_of_requests BIGINT
)
LANGUAGE sql
AS $$
    SELECT
        e.employee_id,
        CONCAT_WS(' ', p.first_name, p.last_name),
        COUNT(DISTINCT a.request_num)
    FROM employees e
    JOIN personal p ON p.id = e.employee_id
    JOIN answers a ON a.personal_id = e.employee_id
    JOIN request r ON r.request_num = a.request_num
    WHERE r.date_and_time >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
      AND r.date_and_time < DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY e.employee_id, p.first_name, p.last_name
    ORDER BY 3 DESC, e.employee_id
    LIMIT 10;
$$;

CREATE OR REPLACE FUNCTION get_employees_by_hours_and_pay()
RETURNS TABLE (
    employee_id VARCHAR(10),
    employee_name TEXT,
    total_hours_worked NUMERIC,
    total_pay NUMERIC
)
LANGUAGE sql
AS $$
    SELECT
        e.employee_id,
        CONCAT_WS(' ', p.first_name, p.last_name),
        COALESCE(SUM(w.total_hours), 0),
        COALESCE(SUM(w.wage * w.total_hours), 0)
    FROM employees e
    JOIN personal p ON p.id = e.employee_id
    LEFT JOIN worked w ON w.personal_id = e.employee_id
    GROUP BY e.employee_id, p.first_name, p.last_name
    ORDER BY 3 DESC, 4 DESC, e.employee_id;
$$;

CREATE OR REPLACE FUNCTION get_stores_average_pay()
RETURNS TABLE (
    store_id VARCHAR(3),
    store_name VARCHAR(50),
    average_pay NUMERIC
)
LANGUAGE sql
AS $$
    SELECT
        s.store_id,
        s.name,
        COALESCE(ROUND(AVG(w.wage), 2), 0)
    FROM store s
    LEFT JOIN worked w ON w.store_id = s.store_id
    GROUP BY s.store_id, s.name
    ORDER BY 3 DESC, s.store_id;
$$;

CREATE OR REPLACE FUNCTION get_employee_product_changes_last_month()
RETURNS TABLE (
    employee_id VARCHAR(10),
    employee_name TEXT,
    number_of_product_changes BIGINT
)
LANGUAGE sql
AS $$
    SELECT
        e.employee_id,
        CONCAT_WS(' ', p.first_name, p.last_name),
        COUNT(mc.change_date_time)
    FROM employees e
    JOIN personal p ON p.id = e.employee_id
    LEFT JOIN makes_change mc
        ON mc.personal_id = e.employee_id
       AND mc.change_date_time >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
       AND mc.change_date_time < DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY e.employee_id, p.first_name, p.last_name
    ORDER BY 3 DESC, e.employee_id;
$$;

CREATE OR REPLACE FUNCTION get_stores_by_monthly_profit_and_revenue_growth()
RETURNS TABLE (
    store_id VARCHAR(3),
    store_name VARCHAR(50),
    month_and_year TEXT,
    monthly_profit NUMERIC,
    previous_month_revenue NUMERIC,
    current_month_revenue NUMERIC,
    revenue_growth NUMERIC
)
LANGUAGE sql
AS $$
    WITH monthly_revenue AS (
        SELECT
            s.store_id,
            s.name AS store_name,
            DATE_TRUNC('month', o.last_date_mod)::DATE AS month_date,
            SUM(
                p.price * i.quantity
                * (1 - COALESCE(o.discount, 0) / 100.0)
            ) AS revenue
        FROM store s
        JOIN sells se ON se.store_id = s.store_id
        JOIN includes i ON i.product_code = se.product_code
        JOIN product p ON p.code = i.product_code
        JOIN "order" o ON o.order_num = i.order_num
        GROUP BY s.store_id, s.name, DATE_TRUNC('month', o.last_date_mod)
    ),
    with_previous AS (
        SELECT
            store_id,
            store_name,
            month_date,
            revenue,
            LAG(revenue) OVER (
                PARTITION BY store_id
                ORDER BY month_date
            ) AS previous_revenue
        FROM monthly_revenue
    )
    SELECT
        store_id,
        store_name,
        TO_CHAR(month_date, 'YYYY-MM'),
        ROUND(revenue, 2),
        ROUND(COALESCE(previous_revenue, 0), 2),
        ROUND(revenue, 2),
        ROUND(revenue - COALESCE(previous_revenue, 0), 2)
    FROM with_previous
    ORDER BY month_date DESC, 4 DESC, store_id;
$$;

CREATE OR REPLACE FUNCTION get_unapproved_reports()
RETURNS TABLE (
    report_date TIMESTAMP,
    store_id VARCHAR(3),
    overall_profit NUMERIC,
    sales_trend VARCHAR(100),
    marketing_growth VARCHAR(100),
    owner_signature VARCHAR(50)
)
LANGUAGE sql
AS $$
    SELECT
        r.date,
        r.store_id,
        r.overall_profit,
        r.sales_trend,
        r.marketing_growth,
        r.owner_signature
    FROM report r
    LEFT JOIN approves a
        ON a.report_date = r.date
       AND a.store_id = r.store_id
    WHERE a.report_date IS NULL
    ORDER BY r.date DESC, r.store_id;
$$;
`;

const database = {
    database: {
        get(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            dbQuery(sql, params || [], (err, result) => {
                callback(err, result && result.rows ? result.rows[0] : undefined);
            });
        },
        all(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            dbQuery(sql, params || [], (err, result) => {
                callback(err, result ? result.rows : []);
            });
        },
        run(sql, params, callback) {
            if (typeof params === 'function') {
                callback = params;
                params = [];
            }
            const normalized = String(sql).trim().replace(/;\s*$/, '').toUpperCase();

            if (normalized === 'BEGIN TRANSACTION' || normalized === 'BEGIN') {
                const existingClient = transactionStorage.getStore();

                // A transaction is already active in this async execution context.
                // Do not create a second transaction on the same request.
                if (existingClient) {
                    callback?.(null);
                    return;
                }

                pool.connect()
                    .then(client => {
                        return client.query('BEGIN')
                            .then(() => {
                                // Everything scheduled by the callback now inherits
                                // this client through AsyncLocalStorage. Other
                                // concurrent requests get their own transaction.
                                transactionStorage.run(client, () => {
                                    callback?.(null);
                                });
                            })
                            .catch(err => {
                                client.release();
                                callback?.(err);
                            });
                    })
                    .catch(err => {
                        callback?.(err);
                    });

                return;
            }

            if (normalized === 'COMMIT') {
                const client = transactionStorage.getStore();

                if (!client) {
                    callback?.(null);
                    return;
                }

                client.query('COMMIT')
                    .then(() => {
                        client.release();
                        callback?.(null);
                    })
                    .catch(err => {
                        // COMMIT may fail before the transaction is completed.
                        // Roll back before releasing the client when possible.
                        client.query('ROLLBACK')
                            .catch(() => {})
                            .then(() => {
                                client.release();
                                callback?.(err);
                            });
                    });

                return;
            }

            if (normalized === 'ROLLBACK') {
                const client = transactionStorage.getStore();

                if (!client) {
                    callback?.(null);
                    return;
                }

                client.query('ROLLBACK')
                    .then(() => {
                        client.release();
                        callback?.(null);
                    })
                    .catch(err => {
                        client.release();
                        callback?.(err);
                    });

                return;
            }

            dbQuery(sql, params || [], (err, result) => {
                if (callback) {
                    callback.call(
                        { changes: result ? result.rowCount : 0, lastID: result?.rows?.[0]?.id },
                        err
                    );
                }
            });
        }
    },

    async installReportFunctions() {
        await pool.query(REPORT_FUNCTIONS_SQL);
        console.log('✅ PostgreSQL report functions installed');
    },

    runReport(reportName, params, callback) {
        const allowed = new Set([
            'get_orders_by_total',
            'get_products_by_total_sales',
            'get_low_stock_high_demand_products',
            'get_products_monthly_sales',
            'get_stores_by_last_calendar_year_revenue',
            'get_products_never_ordered',
            'get_products_by_number_of_orders',
            'get_stores_by_average_review',
            'get_store_with_highest_revenue_growth',
            'get_clients_by_number_of_orders',
            'get_approximate_orders_per_client',
            'get_clients_without_orders',
            'get_store_request_statistics',
            'get_top_10_employees_by_requests_last_month',
            'get_employees_by_hours_and_pay',
            'get_stores_average_pay',
            'get_employee_product_changes_last_month',
            'get_stores_by_monthly_profit_and_revenue_growth',
            'get_unapproved_reports'
        ]);

        if (!allowed.has(reportName)) {
            callback(new Error('Unknown report: ' + reportName), null);
            return;
        }

        const values = Array.isArray(params) ? params : [];
        const placeholders = values.map((_, index) => '$' + (index + 1)).join(', ');

        dbQuery(
            `SELECT * FROM ${reportName}(${placeholders})`,
            values,
            (err, result) => callback(err, result?.rows || [])
        );
    },

    async initializeDatabase() {
        // The database supplied by the project is authoritative.  Existing tables
        // are removed before recreation so an old incompatible schema can never
        // survive a restart and cause CREATE TABLE IF NOT EXISTS to skip columns.
        const schemaCompatibility = await pool.query(`
            SELECT
                EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='product') AS product_exists,
                EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product' AND column_name='category_id') AS product_has_category,
                EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product' AND column_name='store_id') AS product_has_store,
                EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='order' AND column_name='store_id') AS order_has_store,
                EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='request' AND column_name='store_id') AS request_has_store,
                EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='review' AND column_name='review_id') AS review_has_review_id,
                EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='refund' AND column_name='request_date') AS refund_has_request_date
        `);

        const c = schemaCompatibility.rows[0];
        const forceReset = String(process.env.RESET_DATABASE || '').toLowerCase() === 'true' || process.env.RESET_DATABASE === '1';
        const schemaMismatch = !c.product_exists || !c.product_has_category || c.product_has_store || c.order_has_store || c.request_has_store || c.review_has_review_id || c.refund_has_request_date;
        const resetDatabase = forceReset || schemaMismatch;

        if (resetDatabase) {
            console.log('🧹 Existing PostgreSQL schema is incompatible with the project schema. Recreating project tables...');
            await pool.query(`
                DROP TABLE IF EXISTS audit_log CASCADE;
                DROP TABLE IF EXISTS user_roles CASCADE;
                DROP TABLE IF EXISTS roles CASCADE;
                DROP TABLE IF EXISTS users CASCADE;
                DROP TABLE IF EXISTS approves CASCADE;
                DROP TABLE IF EXISTS includes CASCADE;
                DROP TABLE IF EXISTS sells CASCADE;
                DROP TABLE IF EXISTS worked CASCADE;
                DROP TABLE IF EXISTS works_in_store CASCADE;
                DROP TABLE IF EXISTS makes_change CASCADE;
                DROP TABLE IF EXISTS "change" CASCADE;
                DROP TABLE IF EXISTS for_store CASCADE;
                DROP TABLE IF EXISTS answers CASCADE;
                DROP TABLE IF EXISTS makes_request CASCADE;
                DROP TABLE IF EXISTS request CASCADE;
                DROP TABLE IF EXISTS exchanges_data CASCADE;
                DROP TABLE IF EXISTS monthly_profit CASCADE;
                DROP TABLE IF EXISTS report CASCADE;
                DROP TABLE IF EXISTS refund CASCADE;
                DROP TABLE IF EXISTS review CASCADE;
                DROP TABLE IF EXISTS "order" CASCADE;
                DROP TABLE IF EXISTS delivery_address CASCADE;
                DROP TABLE IF EXISTS client CASCADE;
                DROP TABLE IF EXISTS employees CASCADE;
                DROP TABLE IF EXISTS boss CASCADE;
                DROP TABLE IF EXISTS permissions CASCADE;
                DROP TABLE IF EXISTS personal CASCADE;
                DROP TABLE IF EXISTS color CASCADE;
                DROP TABLE IF EXISTS image CASCADE;
                DROP TABLE IF EXISTS product CASCADE;
                DROP TABLE IF EXISTS store CASCADE;
                DROP TABLE IF EXISTS category CASCADE;
            `);
        }

        const schema = `
            CREATE TABLE IF NOT EXISTS category (
                                                    id SERIAL PRIMARY KEY,
                                                    name VARCHAR(50) NOT NULL,
                parent_category_id INTEGER REFERENCES category(id) NOT NULL
                );

            CREATE TABLE IF NOT EXISTS product (
                                                   code VARCHAR(8) PRIMARY KEY DEFAULT '-1',
                price DECIMAL(10,2) NOT NULL CHECK (price >= 0.0),
                availability INTEGER NOT NULL,
                weight DECIMAL(5,2) NOT NULL CHECK (weight > 0),
                width_x_length_x_depth VARCHAR(20) NOT NULL,
                aprox_production_time INTEGER NOT NULL,
                description VARCHAR(500) NOT NULL,
                category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE SET DEFAULT
                );

            CREATE TABLE IF NOT EXISTS image (
                                                 product_code VARCHAR(8) REFERENCES product(code) ON DELETE CASCADE,
                image VARCHAR NOT NULL DEFAULT 'Image NOT found!'
                );

            CREATE TABLE IF NOT EXISTS color (
                                                 product_code VARCHAR(8) REFERENCES product(code) ON DELETE CASCADE,
                color VARCHAR(50)
                );

            CREATE TABLE IF NOT EXISTS store (
                                                 store_ID VARCHAR(3) PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                date_of_founding DATE NOT NULL,
                physical_address VARCHAR(100) NOT NULL,
                store_email VARCHAR(40) UNIQUE NOT NULL CHECK (store_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
                rating DECIMAL(2,1) NOT NULL DEFAULT 0 CHECK (rating>=0.0 AND rating<=5.0)
                );

            CREATE TABLE IF NOT EXISTS personal (
                                                    id VARCHAR(10) PRIMARY KEY,
                first_name VARCHAR(20) NOT NULL,
                last_name VARCHAR(20) NOT NULL,
                ssn VARCHAR(13) NOT NULL CHECK (ssn ~ '^[0-9]{13}$'),
                email VARCHAR(50) UNIQUE NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
                password VARCHAR NOT NULL
                );

            CREATE TABLE IF NOT EXISTS permissions (
                                                       personal_id VARCHAR(10) PRIMARY KEY REFERENCES personal(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                authorisation VARCHAR(50) NOT NULL
                );

            CREATE TABLE IF NOT EXISTS boss (
                                                boss_id VARCHAR(10) PRIMARY KEY REFERENCES personal(id) ON DELETE CASCADE
                );

            CREATE TABLE IF NOT EXISTS employees (
                                                     employee_id VARCHAR(10) PRIMARY KEY REFERENCES personal(id) ON DELETE CASCADE,
                date_of_hire DATE NOT NULL
                );

            CREATE TABLE IF NOT EXISTS client (
                                                  client_ID SERIAL PRIMARY KEY,
                                                  first_name VARCHAR(50) NOT NULL,
                last_name VARCHAR(50) NOT NULL,
                email VARCHAR(50) UNIQUE NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'),
                password VARCHAR NOT NULL
                );

            CREATE TABLE IF NOT EXISTS delivery_address (
                                                            client_ID INTEGER PRIMARY KEY REFERENCES client(client_ID) ON DELETE CASCADE,
                address VARCHAR(200) NOT NULL,
                city VARCHAR(30) NOT NULL,
                postcode VARCHAR(20) NOT NULL,
                country VARCHAR(40) NOT NULL,
                is_default BOOLEAN DEFAULT TRUE
                );

            CREATE TABLE IF NOT EXISTS "order" (
                                                   order_num VARCHAR(11) PRIMARY KEY,
                client_ID INTEGER REFERENCES client(client_ID) ON DELETE CASCADE,
                status VARCHAR(20) NOT NULL DEFAULT 'placed order',
                last_date_mod TIMESTAMP NOT NULL,
                payment_method VARCHAR(250) NOT NULL,
                discount DECIMAL(5,2) DEFAULT 0.0 CHECK(discount>=0.0 AND discount<=100.00),
                CONSTRAINT check_status CHECK (status IN ('placed order', 'being processed', 'shipping', 'delivered', 'canceled'))
                );

            CREATE TABLE IF NOT EXISTS review (
                                                  order_num VARCHAR(11) PRIMARY KEY REFERENCES "order"(order_num) ON DELETE CASCADE,
                comment VARCHAR(300),
                rating DECIMAL(2,1) NOT NULL CHECK(rating>=0.0 AND rating<=5.0),
                last_mod_date TIMESTAMP NOT NULL
                );

            CREATE TABLE IF NOT EXISTS refund (
                                                  refund_id SERIAL PRIMARY KEY,
                                                  order_num VARCHAR(11) REFERENCES "order"(order_num) ON DELETE CASCADE,
                reason VARCHAR(300),
                amount DECIMAL(5,2) NOT NULL,
                status VARCHAR(100) NOT NULL DEFAULT 'requested refund',
                CONSTRAINT check_refund_status CHECK (status IN ('requested refund', 'being reviewed', 'approved', 'not approved', 'processed'))
                );

            CREATE TABLE IF NOT EXISTS report (
                                                  date TIMESTAMP NOT NULL,
                                                  store_ID VARCHAR(3) NOT NULL REFERENCES store(store_ID) ON DELETE CASCADE,
                overall_profit NUMERIC NOT NULL DEFAULT 0.0 CHECK(overall_profit>=0),
                sales_trend VARCHAR(100) NOT NULL,
                marketing_growth VARCHAR(100) NOT NULL,
                owner_signature VARCHAR(50) NOT NULL DEFAULT 'Not signed yet',
                PRIMARY KEY (date, store_ID)
                );

            CREATE TABLE IF NOT EXISTS monthly_profit (
                                                          report_date TIMESTAMP NOT NULL,
                                                          store_ID VARCHAR(3) NOT NULL,
                month_and_year DATE NOT NULL,
                profit NUMERIC NOT NULL DEFAULT 0.0,
                PRIMARY KEY(report_date, store_ID),
                FOREIGN KEY (report_date, store_ID) REFERENCES report(date, store_ID) ON DELETE CASCADE
                );

            CREATE TABLE IF NOT EXISTS exchanges_data (
                                                          report_date TIMESTAMP NOT NULL,
                                                          store_ID VARCHAR(3) NOT NULL,
                monthly_profit NUMERIC NOT NULL DEFAULT 0.0,
                date TIMESTAMP NOT NULL,
                sales NUMERIC NOT NULL DEFAULT 0.0,
                damages NUMERIC NOT NULL DEFAULT 0.0 CHECK (damages<=0),
                PRIMARY KEY (report_date, store_ID),
                FOREIGN KEY (report_date, store_ID) REFERENCES report(date, store_ID) ON DELETE CASCADE
                );

            CREATE TABLE IF NOT EXISTS request (
                                                   request_num VARCHAR(14) PRIMARY KEY,
                date_and_time TIMESTAMP NOT NULL,
                problem VARCHAR(300) NOT NULL,
                notes_of_communication VARCHAR,
                customer_satisfaction NUMERIC NOT NULL
                );

            CREATE TABLE IF NOT EXISTS makes_request (
                                                         client_ID INTEGER NOT NULL REFERENCES client(client_ID) ON DELETE CASCADE,
                order_num VARCHAR(11) UNIQUE NOT NULL REFERENCES "order"(order_num) ON DELETE CASCADE,
                PRIMARY KEY(client_ID, order_num)
                );

            CREATE TABLE IF NOT EXISTS answers (
                                                   request_num VARCHAR(14) REFERENCES request(request_num) ON DELETE CASCADE,
                personal_id VARCHAR(10) NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
                PRIMARY KEY(request_num, personal_id)
                );

            CREATE TABLE IF NOT EXISTS for_store (
                                                     request_num VARCHAR(14) REFERENCES request(request_num) ON DELETE CASCADE,
                store_ID VARCHAR(3) REFERENCES store(store_ID) ON DELETE CASCADE,
                PRIMARY KEY(request_num, store_ID)
                );

            CREATE TABLE IF NOT EXISTS "change" (
                                                    date_and_time TIMESTAMP NOT NULL,
                                                    product_code VARCHAR(8) REFERENCES product(code) ON DELETE CASCADE,
                changes VARCHAR NOT NULL,
                PRIMARY KEY (date_and_time, product_code)
                );

            CREATE TABLE IF NOT EXISTS makes_change (
                                                        personal_id VARCHAR(10) REFERENCES personal(id) ON DELETE CASCADE,
                change_date_time TIMESTAMP,
                product_code VARCHAR(8),
                PRIMARY KEY(personal_id, change_date_time, product_code),
                FOREIGN KEY(change_date_time, product_code) REFERENCES "change"(date_and_time, product_code) ON DELETE CASCADE
                );

            CREATE TABLE IF NOT EXISTS works_in_store (
                                                          personal_id VARCHAR(10) REFERENCES personal(id) ON DELETE CASCADE,
                store_ID VARCHAR(3) REFERENCES store(store_ID) ON DELETE CASCADE,
                PRIMARY KEY(personal_id, store_ID)
                );

            CREATE TABLE IF NOT EXISTS worked (
                                                  personal_id VARCHAR(10) REFERENCES personal(id) ON DELETE CASCADE,
                report_date TIMESTAMP,
                store_ID VARCHAR(3),
                wage NUMERIC NOT NULL CHECK (wage>=0),
                pay_method VARCHAR DEFAULT 'full-time',
                total_hours NUMERIC NOT NULL,
                week VARCHAR(23) NOT NULL,
                PRIMARY KEY (personal_id, report_date, store_ID),
                FOREIGN KEY (report_date, store_ID) REFERENCES report(date, store_ID) ON DELETE CASCADE,
                CONSTRAINT check_pay_method CHECK (pay_method IN ('full_time', 'part-time', 'custom'))
                );

            CREATE TABLE IF NOT EXISTS sells (
                                                 product_code VARCHAR(8) REFERENCES product(code) ON DELETE CASCADE,
                store_ID VARCHAR(3) REFERENCES store(store_ID) ON DELETE CASCADE,
                discount NUMERIC NOT NULL DEFAULT 0.0,
                PRIMARY KEY (product_code, store_ID)
                );

            CREATE TABLE IF NOT EXISTS includes (
                                                    order_num VARCHAR(11) REFERENCES "order"(order_num) ON DELETE CASCADE,
                product_code VARCHAR(8) REFERENCES product(code) ON DELETE CASCADE,
                quantity INTEGER NOT NULL CHECK(quantity>=0),
                PRIMARY KEY (order_num, product_code)
                );

            CREATE TABLE IF NOT EXISTS approves (
                                                    boss_id VARCHAR(10) REFERENCES boss(boss_id) ON DELETE CASCADE,
                report_date TIMESTAMP,
                store_ID VARCHAR(3),
                owner_signature VARCHAR NOT NULL,
                PRIMARY KEY (boss_id, report_date, store_ID),
                FOREIGN KEY (report_date, store_ID) REFERENCES report(date, store_ID) ON DELETE CASCADE
                );

            -- These four small tables are application authentication/audit storage.
            -- They do not modify any of the project tables above.
            CREATE TABLE IF NOT EXISTS users (
                                                 id VARCHAR(50) PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                user_type VARCHAR(50) NOT NULL,
                force_password_change BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

            CREATE TABLE IF NOT EXISTS roles (
                                                 role_id SERIAL PRIMARY KEY,
                                                 name VARCHAR(50) UNIQUE NOT NULL,
                description TEXT
                );

            CREATE TABLE IF NOT EXISTS user_roles (
                                                      user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
                PRIMARY KEY(user_id, role_id)
                );

            CREATE TABLE IF NOT EXISTS audit_log (
                                                     log_id BIGSERIAL PRIMARY KEY,
                                                     user_id VARCHAR(50),
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(50),
                resource_id VARCHAR(50),
                details TEXT,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

            CREATE INDEX IF NOT EXISTS idx_product_category ON product(category_id);
            CREATE INDEX IF NOT EXISTS idx_order_client ON "order"(client_ID);
            CREATE INDEX IF NOT EXISTS idx_review_order ON review(order_num);
            CREATE INDEX IF NOT EXISTS idx_request_date ON request(date_and_time);
            CREATE INDEX IF NOT EXISTS idx_refund_order ON refund(order_num);
            CREATE INDEX IF NOT EXISTS idx_personal_email ON personal(email);
            CREATE INDEX IF NOT EXISTS idx_client_email ON client(email);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
        `;

        await pool.query(schema);

        // ------------------------------------------------------------
        // Compatibility migration for older PostgreSQL databases.
        //
        // Some existing project databases contain a permissions table
        // created by an older version of the schema with a typo such as
        // personal_is instead of personal_id. CREATE TABLE IF NOT EXISTS cannot add
        // missing columns to an existing table, so the admin bootstrap
        // INSERT would otherwise fail with PostgreSQL error 42703.
        //
        // The migration is intentionally non-destructive: it keeps all
        // existing rows, renames the typo when possible, and migrates the old typo column into the expected schema without deleting
        // permission values.
        // ------------------------------------------------------------
        await pool.query(`
            DO $$
            BEGIN
                -- Some older versions of the database used the typo
                -- personal_is instead of personal_id. Rename it rather
                -- than adding a second column: the old column may be NOT NULL
                -- and would otherwise make the admin bootstrap INSERT fail.
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'permissions'
                      AND column_name = 'personal_is'
                ) AND NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'permissions'
                      AND column_name = 'personal_id'
                ) THEN
                    ALTER TABLE permissions
                        RENAME COLUMN personal_is TO personal_id;
                END IF;

                -- If neither spelling exists, add the expected column.
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'permissions'
                      AND column_name = 'personal_id'
                ) THEN
                    ALTER TABLE permissions
                        ADD COLUMN personal_id VARCHAR(10);
                END IF;

                -- Some databases were already partially migrated and therefore
                -- contain BOTH personal_is and personal_id. If the old typo
                -- column participates in the primary key, PostgreSQL will not
                -- allow us to drop its NOT NULL requirement. Migrate the
                -- primary-key data to personal_id first, then remove the old
                -- typo column from the key and drop it.
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'permissions'
                      AND column_name = 'personal_is'
                ) AND EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'permissions'
                      AND column_name = 'personal_id'
                ) THEN
                    -- Copy old primary-key values into the new column where
                    -- the new column is currently empty.
                    UPDATE permissions
                    SET personal_id = personal_is
                    WHERE personal_id IS NULL
                      AND personal_is IS NOT NULL;

                    -- Remove the old typo column from the primary key.
                    DO $drop_old_permission_pk$
                    DECLARE
                        pk_name TEXT;
                    BEGIN
                        SELECT tc.constraint_name
                        INTO pk_name
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu
                          ON kcu.constraint_name = tc.constraint_name
                         AND kcu.table_schema = tc.table_schema
                         AND kcu.table_name = tc.table_name
                        WHERE tc.table_schema = 'public'
                          AND tc.table_name = 'permissions'
                          AND tc.constraint_type = 'PRIMARY KEY'
                          AND kcu.column_name = 'personal_is'
                        LIMIT 1;

                        IF pk_name IS NOT NULL THEN
                            EXECUTE format(
                                'ALTER TABLE permissions DROP CONSTRAINT %I',
                                pk_name
                            );
                        END IF;
                    END
                    $drop_old_permission_pk$;

                    -- The application uses personal_id as the primary key.
                    -- Drop the obsolete typo column after preserving its data.
                    ALTER TABLE permissions
                        DROP COLUMN personal_is;

                    -- Recreate the primary key on the correct column if one
                    -- was removed above and no primary key currently exists.
                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints
                        WHERE table_schema = 'public'
                          AND table_name = 'permissions'
                          AND constraint_type = 'PRIMARY KEY'
                    ) THEN
                        ALTER TABLE permissions
                            ADD PRIMARY KEY (personal_id);
                    END IF;
                END IF;

                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'permissions'
                      AND column_name = 'type'
                ) THEN
                    ALTER TABLE permissions
                        ADD COLUMN type VARCHAR(50);
                END IF;

                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'permissions'
                      AND column_name = 'authorisation'
                ) THEN
                    ALTER TABLE permissions
                        ADD COLUMN authorisation VARCHAR(50);
                END IF;
            END
            $$;
        `);

        // ON CONFLICT(personal_id) requires a unique/exclusion constraint
        // that PostgreSQL can use for conflict inference. A unique index
        // permits multiple NULL values, so this remains safe for any legacy
        // permission rows that do not have a personal_id yet.
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS
                permissions_personal_id_unique
                ON permissions(personal_id)
        `);

        const roles = [
            ['admin', 'System administrator'],
            ['store_owner', 'Store owner'],
            ['store_employee', 'Store employee'],
            ['client', 'Registered client'],
            ['guest', 'Unregistered guest']
        ];

        for (const [name, description] of roles) {
            await pool.query(
                'INSERT INTO roles(name, description) VALUES($1,$2) ON CONFLICT(name) DO NOTHING',
                [name, description]
            );
        }

        const hash = bcrypt.hashSync('Admin123!', 10);
        await pool.query(
            `INSERT INTO users(id, username, email, password, user_type, force_password_change)
             VALUES('000000','admin','admin@handcraft.com',$1,'admin',TRUE) ON CONFLICT(id) DO NOTHING`,
            [hash]
        );
        await pool.query(
            `INSERT INTO personal(id, first_name, last_name, ssn, email, password)
             VALUES('000000','Admin','User','0000000000000','admin@handcraft.com',$1) ON CONFLICT(id) DO NOTHING`,
            [hash]
        );
        await pool.query(`INSERT INTO boss(boss_id) VALUES('000000') ON CONFLICT(boss_id) DO NOTHING`);
        await pool.query(
            `INSERT INTO permissions(personal_id,type,authorisation)
             VALUES('000000','ADMIN','full_access') ON CONFLICT(personal_id) DO NOTHING`
        );
        await pool.query(
            `INSERT INTO user_roles(user_id,role_id)
             SELECT '000000', role_id FROM roles WHERE name='admin' ON CONFLICT DO NOTHING`
        );
        console.log('✅ PostgreSQL project schema was recreated successfully');
    },

    close() {
        return pool.end();
    },

    getUserById(id, callback) {
        dbQuery(
            `SELECT u.*,
                    COALESCE(json_agg(json_build_object('name',r.name,'description',r.description))
                             FILTER (WHERE r.role_id IS NOT NULL), '[]') AS roles
             FROM users u
                      LEFT JOIN user_roles ur ON ur.user_id=u.id
                      LEFT JOIN roles r ON r.role_id=ur.role_id
             WHERE u.id=$1
             GROUP BY u.id`,
            [String(id)],
            (err, result) => callback(err, result?.rows?.[0])
        );
    },

    getUserByUsername(username, callback) {
        dbQuery(
            `SELECT u.*,
                    COALESCE(json_agg(json_build_object('name',r.name,'description',r.description))
                             FILTER (WHERE r.role_id IS NOT NULL), '[]') AS roles
             FROM users u
                      LEFT JOIN user_roles ur ON ur.user_id=u.id
                      LEFT JOIN roles r ON r.role_id=ur.role_id
             WHERE u.username=$1 OR u.email=$1
             GROUP BY u.id
                 LIMIT 1`,
            [username],
            (err, result) => callback(err, result?.rows?.[0])
        );
    },

    createUser(id, username, email, password, userType, callback) {
        dbQuery(
            `INSERT INTO users(id,username,email,password,user_type,force_password_change)
             VALUES($1,$2,$3,$4,$5,FALSE) RETURNING id`,
            [String(id), username, email, password, userType],
            (err, result) => {
                if (err) return callback(err);
                const roleName = userType === 'client' ? 'client' :
                    userType === 'store_owner' ? 'store_owner' :
                        userType === 'store_employee' ? 'store_employee' : 'guest';
                dbQuery(
                    `INSERT INTO user_roles(user_id,role_id)
                     SELECT $1, role_id FROM roles WHERE name=$2`,
                    [String(id), roleName],
                    roleErr => callback(roleErr, String(id))
                );
            }
        );
    },

    createClient(data, callback) {
        dbQuery(
            `INSERT INTO client(first_name,last_name,email,password)
             VALUES($1,$2,$3,$4) RETURNING client_id`,
            [data.firstName || data.first_name || '', data.lastName || data.last_name || '', data.email, data.password],
            (err, result) => callback(err, result?.rows?.[0]?.client_id)
        );
    },

    getClientByEmail(email, callback) {
        dbQuery('SELECT * FROM client WHERE email=$1', [email],
            (err, result) => callback(err, result?.rows?.[0]));
    },

    getClientById(id, callback) {
        dbQuery('SELECT * FROM client WHERE client_id=$1', [id],
            (err, result) => callback(err, result?.rows?.[0]));
    },

    getPersonalByEmail(email, callback) {
        dbQuery('SELECT * FROM personal WHERE email=$1', [email],
            (err, result) => callback(err, result?.rows?.[0]));
    },

    getPersonalById(id, callback) {
        dbQuery('SELECT * FROM personal WHERE id=$1', [String(id)],
            (err, result) => callback(err, result?.rows?.[0]));
    },

    verifyPassword(password, hash) {
        try { return bcrypt.compareSync(password, hash); } catch { return false; }
    },

    verifyClientPassword(password, hash, callback) {
        bcrypt.compare(password, hash, callback);
    },

    logAudit(userId, action, resourceType, resourceId, details, ipAddress) {
        dbQuery(
            `INSERT INTO audit_log(user_id,action,resource_type,resource_id,details,ip_address)
             VALUES($1,$2,$3,$4,$5,$6)`,
            [userId == null ? null : String(userId), action, resourceType,
                resourceId == null ? null : String(resourceId), details, ipAddress],
            () => {}
        );
    },

    getProducts(categoryId, searchTerm, callback) {
        const params = [];
        const where = [];
        if (categoryId) {
            params.push(categoryId);
            where.push(`p.category_id=$${params.length}`);
        }
        if (searchTerm) {
            params.push(`%${searchTerm}%`);
            where.push(`(p.description ILIKE $${params.length} OR p.code ILIKE $${params.length})`);
        }
        const sql = `SELECT p.*, c.name AS category_name, LEFT(p.code,3) AS store_id
                     FROM product p
                         LEFT JOIN category c ON c.id=p.category_id
                         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY p.code`;
        dbQuery(sql, params, (err, result) => callback(err, result?.rows || []));
    },

    getProductById(id, callback) {
        dbQuery(
            `SELECT p.*, c.name AS category_name, LEFT(p.code,3) AS store_id
             FROM product p
                 LEFT JOIN category c ON c.id=p.category_id
             WHERE p.code=$1 LIMIT 1`,
            [String(id)],
            (err,result)=>callback(err,result?.rows?.[0])
        );
    },

    getProductByCode(code, callback) {
        dbQuery(
            `SELECT p.*, c.name AS category_name, LEFT(p.code,3) AS store_id
             FROM product p
                 LEFT JOIN category c ON c.id=p.category_id
             WHERE p.code=$1`,
            [code],
            (err,result)=>callback(err,result?.rows?.[0])
        );
    },

    addProduct(personalId, data, callback) {
        const storeId = data.store_id || data.storeId || String(data.code || '').slice(0,3);
        if (!data.category_id) {
            return callback(new Error('category_id is required because product.category_id is NOT NULL'));
        }
        dbQuery(
            `INSERT INTO product(code,price,availability,weight,width_x_length_x_depth,
                                 aprox_production_time,description,category_id)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING code`,
            [
                data.code, data.price, data.availability ?? 0, data.weight,
                data.width_x_length_x_depth || data.dimensions || '',
                data.aprox_production_time ?? data.production_time ?? 0,
                data.description, data.category_id
            ],
            (err,result)=>{
                if (err) return callback(err);
                dbQuery(
                    `INSERT INTO sells(product_code,store_ID,discount)
                     VALUES($1,$2,$3)
                         ON CONFLICT(product_code,store_ID)
                     DO UPDATE SET discount=EXCLUDED.discount`,
                    [data.code,storeId,data.discount || 0],
                    e => callback(e, data.code)
                );
            }
        );
    },

    updateProduct(personalId, data, callback) {
        const fields = [];
        const params = [];
        const allowed = [
            ['price','price'], ['availability','availability'], ['weight','weight'],
            ['width_x_length_x_depth','width_x_length_x_depth'],
            ['dimensions','width_x_length_x_depth'],
            ['aprox_production_time','aprox_production_time'],
            ['production_time','aprox_production_time'],
            ['description','description'], ['category_id','category_id']
        ];
        for (const [input,col] of allowed) {
            if (data[input] !== undefined) {
                params.push(data[input]);
                fields.push(`${col}=$${params.length}`);
            }
        }
        if (!fields.length) return callback(null,0);
        params.push(data.code);
        dbQuery(`UPDATE product SET ${fields.join(', ')} WHERE code=$${params.length}`, params,
            (err,result)=>callback(err,result?.rowCount || 0));
    },

    deleteProduct(productCode, storeId, personalId, callback) {
        dbQuery('DELETE FROM product WHERE code=$1 AND LEFT(code,3)=$2', [productCode,storeId],
            (err)=>callback(err));
    },

    createCategory(data, callback) {
        const parent = data.parent_category_id ?? data.parentCategoryId ?? data.parent_id;
        if (parent === undefined || parent === null || parent === '') {
            return callback(new Error('parent_category_id is required by the project schema'));
        }
        dbQuery(
            `INSERT INTO category(name,parent_category_id) VALUES($1,$2) RETURNING id,name,parent_category_id`,
            [data.name, parent],
            (err,result)=>callback(err,result?.rows?.[0])
        );
    },

    getCategories(callback) {
        dbQuery('SELECT * FROM category ORDER BY name', [], (err,result)=>callback(err,result?.rows||[]));
    },

    getCategoriesWithParents(callback) {
        dbQuery(
            `SELECT c.*,p.name AS parent_name
             FROM category c LEFT JOIN category p ON p.id=c.parent_category_id
             ORDER BY c.name`,
            [], (err,result)=>callback(err,result?.rows||[])
        );
    },

    getStores(callback) {
        dbQuery('SELECT * FROM store ORDER BY name', [], (err,result)=>callback(err,result?.rows||[]));
    },

    createOrderNew(data, callback) {
        const items = data.items || data.products || data.order_items || [];
        const storeId = data.store_id || data.storeId || (items[0]?.code ? String(items[0].code).slice(0,3) : null);
        if (!storeId) return callback(new Error('Store ID is required'));
        const year = String(new Date().getFullYear()).slice(-3);

        dbQuery(
            `SELECT COUNT(*)::int AS n
             FROM "order"
             WHERE LEFT(order_num,3)=$1
               AND SUBSTRING(order_num FROM 4 FOR 3)=$2`,
            [storeId, year],
            (countErr,countResult)=>{
                if (countErr) return callback(countErr);
                const seq=Number(countResult.rows[0].n)+1;
                const orderNum=`${storeId}${year}${String(seq).padStart(5,'0')}`;
                dbQuery(
                    `INSERT INTO "order"(order_num,client_ID,status,last_date_mod,payment_method,discount)
                     VALUES($1,$2,$3,CURRENT_TIMESTAMP,$4,$5) RETURNING order_num`,
                    [orderNum,data.client_id,data.status||'placed order',data.payment_method||'cash',data.discount||0],
                    (err,result)=>{
                        if(err) return callback(err);
                        let pending=items.length;
                        if(!pending) return callback(null,orderNum);
                        let firstErr=null;
                        for(const item of items){
                            dbQuery(
                                `INSERT INTO includes(order_num,product_code,quantity) VALUES($1,$2,$3)`,
                                [orderNum,item.product_code||item.code,item.quantity||1],
                                e=>{ if(e && !firstErr) firstErr=e; if(--pending===0) callback(firstErr,firstErr?undefined:orderNum); }
                            );
                        }
                    }
                );
            }
        );
    },

    getOrdersByClient(clientId, callback) {
        dbQuery(
            `SELECT o.*, LEFT(o.order_num,3) AS store_id,
                 o.last_date_mod AS order_date,
                 COALESCE(json_agg(json_build_object('product_code',i.product_code,'quantity',i.quantity,'price',p.price))
                 FILTER(WHERE i.product_code IS NOT NULL),'[]') AS items
             FROM "order" o
                 LEFT JOIN includes i ON i.order_num=o.order_num
                 LEFT JOIN product p ON p.code=i.product_code
             WHERE o.client_ID=$1
             GROUP BY o.order_num
             ORDER BY o.last_date_mod DESC`,
            [clientId],(err,result)=>callback(err,result?.rows||[])
        );
    },

    createReviewNew(data, callback) {
        dbQuery(
            `INSERT INTO review(order_num,comment,rating,last_mod_date)
             VALUES($1,$2,$3,CURRENT_TIMESTAMP)
                 RETURNING order_num`,
            [data.order_num,data.comment||null,data.rating],
            (err,result)=>callback(err,result?.rows?.[0]?.order_num)
        );
    },

    createRequest(data, callback) {
        dbQuery(
            `INSERT INTO request(request_num,date_and_time,problem,notes_of_communication,customer_satisfaction)
             VALUES($1,$2,$3,$4,0) RETURNING request_num`,
            [data.request_num,data.date_and_time,data.problem,data.notes_of_communication||null],
            (err,result)=>{
                if (err) return callback(err);
                dbQuery(
                    `INSERT INTO for_store(request_num,store_ID) VALUES($1,$2)`,
                    [data.request_num,data.store_id],
                    storeErr=>{
                        if (storeErr) return callback(storeErr);
                        if (data.order_num) {
                            dbQuery(
                                `INSERT INTO makes_request(client_ID,order_num) VALUES($1,$2)`,
                                [data.client_id,data.order_num],
                                e=>callback(e,data.request_num)
                            );
                        } else {
                            callback(null,data.request_num);
                        }
                    }
                );
            }
        );
    },

    createRefund(data, callback) {
        const suppliedId = data.refund_id;
        const query = suppliedId
            ? `INSERT INTO refund(refund_id,order_num,reason,amount,status) VALUES($1,$2,$3,$4,$5) RETURNING refund_id`
            : `INSERT INTO refund(order_num,reason,amount,status) VALUES($1,$2,$3,$4) RETURNING refund_id`;
        const params = suppliedId
            ? [Number.parseInt(String(suppliedId),10) || undefined,data.order_num,data.reason||null,data.amount,data.status||'requested refund']
            : [data.order_num,data.reason||null,data.amount,data.status||'requested refund'];
        dbQuery(query,params,(err,result)=>callback(err,result?.rows?.[0]?.refund_id));
    },

    getAllUsers(callback) {
        dbQuery(`SELECT u.*,COALESCE(json_agg(r.name) FILTER(WHERE r.role_id IS NOT NULL),'[]') roles
                 FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id
                              LEFT JOIN roles r ON r.role_id=ur.role_id GROUP BY u.id ORDER BY u.created_at DESC`,
            [],(err,result)=>callback(err,result?.rows||[]));
    },

    getAllOrders(callback) {
        dbQuery(`SELECT o.*, LEFT(o.order_num,3) AS store_id, o.last_date_mod AS order_date,
                     c.first_name,c.last_name,c.email
                 FROM "order" o
                     LEFT JOIN client c ON c.client_id=o.client_ID
                 ORDER BY o.last_date_mod DESC`,
            [],(err,result)=>callback(err,result?.rows||[]));
    },

    getStoreProducts(storeId, callback) {
        dbQuery(`SELECT p.*,c.name AS category_name,LEFT(p.code,3) AS store_id,s.discount
                 FROM product p
                     LEFT JOIN category c ON c.id=p.category_id
                     LEFT JOIN sells s ON s.product_code=p.code AND s.store_ID=$1
                 WHERE LEFT(p.code,3)=$1 OR EXISTS(SELECT 1 FROM sells sx WHERE sx.product_code=p.code AND sx.store_ID=$1)
                 ORDER BY p.code`,[storeId],(err,result)=>callback(err,result?.rows||[]));
    },

    getStoreOrders(storeId, callback) {
        dbQuery(`SELECT o.*,LEFT(o.order_num,3) AS store_id,o.last_date_mod AS order_date,c.first_name,c.last_name
                 FROM "order" o
                     LEFT JOIN client c ON c.client_id=o.client_ID
                 WHERE LEFT(o.order_num,3)=$1 ORDER BY o.last_date_mod DESC`,[storeId],
            (err,result)=>callback(err,result?.rows||[]));
    },

    getStoreEmployees(storeId, callback) {
        dbQuery(`SELECT p.*,e.date_of_hire,per.type,per.authorisation
                 FROM personal p JOIN works_in_store w ON w.personal_id=p.id
                                 LEFT JOIN employees e ON e.employee_id=p.id
                                 LEFT JOIN permissions per ON per.personal_id=p.id
                 WHERE w.store_ID=$1 ORDER BY p.last_name,p.first_name`,
            [storeId],(err,result)=>callback(err,result?.rows||[]));
    },

    getStoreReports(storeId, callback) {
        dbQuery(
            `SELECT date, store_id, overall_profit, sales_trend, marketing_growth, owner_signature
             FROM report
             WHERE store_id = $1
             ORDER BY date DESC`,
            [storeId],
            (err, result) => callback(err, result?.rows || [])
        );
    },

    getStoreStats(storeId, callback) {
        const sql = `
            SELECT
                (SELECT COUNT(DISTINCT product_code)
                 FROM sells
                 WHERE store_ID = $1)::int AS product_count,

                    (SELECT COUNT(DISTINCT o.order_num)
                     FROM sells se
                              JOIN includes i ON i.product_code = se.product_code
                              JOIN "order" o ON o.order_num = i.order_num
                     WHERE se.store_ID = $1)::int AS order_count,

                    (SELECT COALESCE(SUM(
                                             i.quantity * p.price
                                                 * (1 - COALESCE(o.discount, 0) / 100.0)
                                     ), 0)
                     FROM sells se
                              JOIN includes i ON i.product_code = se.product_code
                              JOIN "order" o ON o.order_num = i.order_num
                              JOIN product p ON p.code = i.product_code
                     WHERE se.store_ID = $1) AS revenue,

                (SELECT COUNT(*)
                 FROM works_in_store
                 WHERE store_ID = $1)::int AS employee_count,

                    (SELECT COUNT(*)
                     FROM for_store
                     WHERE store_ID = $1)::int AS request_count,

                    (SELECT COUNT(*)
                     FROM refund r
                              JOIN "order" o ON o.order_num = r.order_num
                     WHERE LEFT(o.order_num, 3) = $1)::int AS refund_count
        `;

        dbQuery(sql, [storeId], (err, result) => {
            callback(err, result?.rows?.[0] || {});
        });
    },

    generateStoreReport(storeId, startDate, endDate, type, period, ownerSignature, callback) {
        dbQuery(
            `WITH sales AS (
                SELECT COALESCE(SUM(
                                        p.price * i.quantity
                                            * (1 - COALESCE(o.discount, 0) / 100.0)
                                ), 0) AS revenue
                FROM sells se
                         JOIN product p ON p.code = se.product_code
                         JOIN includes i ON i.product_code = se.product_code
                         JOIN "order" o ON o.order_num = i.order_num
                WHERE se.store_ID = $1
                  AND o.last_date_mod >= $2::timestamp
                 AND o.last_date_mod < ($3::timestamp + INTERVAL '1 day')
                 ),
                 refunds AS (
             SELECT COALESCE(SUM(rf.amount), 0) AS refund_total
             FROM refund rf
                 JOIN "order" o ON o.order_num = rf.order_num
             WHERE LEFT(o.order_num, 3) = $1
               AND o.last_date_mod >= $2::timestamp
               AND o.last_date_mod < ($3::timestamp + INTERVAL '1 day')
               AND rf.status IN ('approved', 'processed')
                 )
            SELECT sales.revenue, refunds.refund_total,
                   sales.revenue - refunds.refund_total AS net_profit
            FROM sales CROSS JOIN refunds`,
            [storeId, startDate, endDate],
            (err, result) => {
                if (err) return callback(err);

                const row = result.rows[0] || {};
                const revenue = Number(row.revenue || 0);
                const refundTotal = Number(row.refund_total || 0);
                const netProfit = Number(row.net_profit || 0);

                dbQuery(
                    `SELECT COALESCE(SUM(
                                             p.price * i.quantity
                                                 * (1 - COALESCE(o.discount, 0) / 100.0)
                                     ), 0) AS previous_revenue
                     FROM sells se
                              JOIN product p ON p.code = se.product_code
                              JOIN includes i ON i.product_code = se.product_code
                              JOIN "order" o ON o.order_num = i.order_num
                     WHERE se.store_ID = $1
                       AND o.last_date_mod >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                       AND o.last_date_mod < DATE_TRUNC('month', CURRENT_DATE)`,
                    [storeId],
                    (previousErr, previousResult) => {
                        if (previousErr) return callback(previousErr);

                        const previousRevenue = Number(previousResult.rows[0]?.previous_revenue || 0);
                        const growth = previousRevenue === 0
                            ? (revenue > 0 ? 100 : 0)
                            : ((revenue - previousRevenue) / previousRevenue) * 100;

                        dbQuery(
                            `INSERT INTO report
                             (date, store_ID, overall_profit, sales_trend, marketing_growth, owner_signature)
                             VALUES
                                 (CURRENT_TIMESTAMP, $1, $2, $3, $4, $5)
                                 RETURNING date, store_ID, overall_profit, sales_trend, marketing_growth, owner_signature`,
                            [
                                storeId,
                                Math.max(0, netProfit),
                                `Revenue ${revenue.toFixed(2)}; Refunds ${refundTotal.toFixed(2)}`.slice(0, 100),
                                `${growth.toFixed(2)}%`,
                                ownerSignature || 'Not signed yet'
                            ],
                            (insertErr, insertResult) => {
                                if (insertErr) return callback(insertErr);

                                const report = insertResult.rows[0];

                                dbQuery(
                                    `INSERT INTO monthly_profit
                                         (report_date, store_ID, month_and_year, profit)
                                     VALUES
                                         ($1, $2, DATE_TRUNC('month', $3::timestamp)::DATE, $4)
                                         ON CONFLICT (report_date, store_ID)
                                     DO UPDATE SET
                                        month_and_year = EXCLUDED.month_and_year,
                                                                                     profit = EXCLUDED.profit`,
                                    [report.date, storeId, endDate, Math.max(0, netProfit)],
                                    (monthlyErr) => {
                                        if (monthlyErr) console.error('Warning inserting monthly profit:', monthlyErr);

                                        dbQuery(
                                            `INSERT INTO exchanges_data
                                                 (report_date, store_ID, monthly_profit, date, sales, damages)
                                             VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5)
                                                 ON CONFLICT (report_date, store_ID)
                                             DO UPDATE SET
                                                monthly_profit = EXCLUDED.monthly_profit,
                                                                                                     date = EXCLUDED.date,
                                                                                                     sales = EXCLUDED.sales,
                                                                                                     damages = EXCLUDED.damages`,
                                            [report.date, storeId, Math.max(0, netProfit), revenue, -refundTotal],
                                            (exchangeErr) => {
                                                if (exchangeErr) console.error('Warning inserting exchange data:', exchangeErr);
                                                callback(null, report);
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    },

    getEmployeeTasks(personalId, storeId, callback) {
        dbQuery(`SELECT r.*,a.personal_id AS answered_by
                 FROM request r
                          JOIN for_store fs ON fs.request_num=r.request_num
                          LEFT JOIN answers a ON a.request_num=r.request_num
                 WHERE fs.store_ID=$1 AND (a.personal_id=$2 OR a.personal_id IS NULL)
                 ORDER BY r.date_and_time DESC`,
            [storeId,personalId],(err,result)=>callback(err,result?.rows||[]));
    },

    getClientStats(clientId, callback) {
        dbQuery(`SELECT
                         (SELECT COUNT(*) FROM "order" WHERE client_ID=$1)::int AS order_count,
                         (SELECT COUNT(*) FROM review r JOIN "order" o ON o.order_num=r.order_num WHERE o.client_ID=$1)::int AS review_count,
                         (SELECT COUNT(*) FROM makes_request WHERE client_ID=$1)::int AS request_count,
                         (SELECT COUNT(*) FROM refund r JOIN "order" o ON o.order_num=r.order_num WHERE o.client_ID=$1)::int AS refund_count`,
            [clientId],(err,result)=>callback(err,result?.rows?.[0]||{}));
    }
};



// PostgreSQL schema initialization.
// The schema is based on the supplied Pasted markdown.md. A few invalid PostgreSQL
// declarations in the original paste are corrected here (for example DECIMMAL,
// PARTIAL KEY, and composite-key column-name typos). The existing HTTP layer also
// uses only the project schema plus the four authentication/audit support tables.
(async () => {
    try {
        await database.initializeDatabase();
        await database.installReportFunctions();
        console.log('✅ Database initialization completed');
    } catch (err) {
        console.error('❌ Database initialization failed:', err);
        process.exitCode = 1;
    }
})();

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const ipAddress = getClientIp(req);

    console.log('Request:', req.method, pathname);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (pathname === '/' || pathname === '/index.html') {
        serveStaticFile(res, 'index.html', 'text/html');
    } else if (pathname === '/login.html') {
        serveStaticFile(res, 'login.html', 'text/html');
    } else if (pathname === '/register.html') {
        serveStaticFile(res, 'register.html', 'text/html');
    } else if (pathname === '/register-store.html') {
        serveStaticFile(res, 'register-store.html', 'text/html');
    } else if (pathname === '/dashboard.html') {
        const cookies = parseCookies(req);
        const sessionId = cookies.sessionId;

        if (!sessionId || !sessions.has(sessionId)) {
            res.writeHead(302, { 'Location': '/login.html' });
            res.end();
            return;
        }

        if (tempAdminSessions.has(sessionId)) {
            res.writeHead(302, { 'Location': '/change-password.html?forced=true' });
            res.end();
            return;
        }

        serveStaticFile(res, 'dashboard.html', 'text/html');
    } else if (pathname === '/verify-email.html') {
        serveStaticFile(res, 'verify-email.html', 'text/html');
    } else if (pathname === '/verify-2fa.html') {
        serveStaticFile(res, 'verify-2fa.html', 'text/html');
    } else if (pathname === '/admin.html') {
        // Check if user is authenticated
        const cookies = parseCookies(req);
        const sessionId = cookies.sessionId;

        if (!sessionId || !sessions.has(sessionId)) {
            res.writeHead(302, { 'Location': '/login.html' });
            res.end();
            return;
        }

        // Get user from session
        const userId = sessions.get(sessionId);

        // Check if this is the admin user
        if (userId !== '000000') {
            // Not admin, redirect to appropriate dashboard
            if (userId.startsWith('client_')) {
                res.writeHead(302, { 'Location': '/client-dashboard.html' });
            } else if (userId.startsWith('personal_')) {
                // Check if store owner or employee
                const personalId = userId.replace('personal_', '');

                database.database.get(
                    'SELECT boss_id FROM boss WHERE boss_id = $1',
                    [personalId],
                    (err, boss) => {
                        if (boss) {
                            res.writeHead(302, { 'Location': '/store-owner.html' });
                        } else {
                            res.writeHead(302, { 'Location': '/store-employee.html' });
                        }
                        res.end();
                    }
                );
                return;
            } else {
                res.writeHead(302, { 'Location': '/dashboard.html' });
            }
            res.end();
            return;
        }

        serveStaticFile(res, 'admin.html', 'text/html');
    } else if (pathname === '/store-owner.html') {
        serveStaticFile(res, 'store-owner.html', 'text/html');
    } else if (pathname === '/store-employee.html') {
        serveStaticFile(res, 'store-employee.html', 'text/html');
    } else if (pathname === '/client-dashboard.html') {
        serveStaticFile(res, 'client-dashboard.html', 'text/html');
    } else if (pathname === '/products.html') {
        serveStaticFile(res, 'products.html', 'text/html');
    } else if (pathname === '/product-detail.html') {
        serveStaticFile(res, 'product-detail.html', 'text/html');
    } else if (pathname === '/checkout.html') {
        serveStaticFile(res, 'checkout.html', 'text/html');
    } else if (pathname === '/orders.html') {
        serveStaticFile(res, 'orders.html', 'text/html');
    } else if (pathname === '/reviews.html') {
        serveStaticFile(res, 'reviews.html', 'text/html');
    } else if (pathname === '/change-password.html') {
        serveStaticFile(res, 'change-password.html', 'text/html');
    } else if (pathname === '/style.css') {
        serveStaticFile(res, 'style.css', 'text/css');
    } else if (pathname === '/script.js') {
        serveStaticFile(res, 'script.js', 'application/javascript');
    }

    else if (pathname === '/api/register' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const { username, email, password, userType, firstName, lastName } = JSON.parse(body);

            if (!username || !email || !password || !userType) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'All fields are required' }));
                return;
            }

            if (!validateEmail(email)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Email is not valid' }));
                return;
            }

            if (!validatePassword(password)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'Password must have at least 8 characters, including uppercase, lowercase, number and special character'
                }));
                return;
            }

            database.getUserByUsername(username, (err, existingUser) => {
                if (err) {
                    console.error('Error checking user:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Server error checking user' }));
                    return;
                }

                database.getClientByEmail(email, (err, existingClient) => {
                    if (err) {
                        console.error('Error checking client:', err);
                    }

                    if (existingUser || existingClient) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Username or email is already in use' }));
                        return;
                    }

                    const verificationCode = generateVerificationCode();

                    const tempUserData = {
                        username,
                        email,
                        password,
                        timestamp: Date.now(),
                        userType: userType,
                        firstName: firstName || '',
                        lastName: lastName || ''
                    };

                    tempUsers.set(verificationCode, tempUserData);
                    verificationCodes.set(email, { code: verificationCode, timestamp: Date.now() });

                    console.log(`⏰ Generated verification code for ${email}, expires in 30 seconds`);

                    sendVerificationEmail(email, verificationCode)
                        .then(() => {
                            console.log('✅ Verification email sent to:', email);
                            database.logAudit(null, 'REGISTER_ATTEMPT', 'user', null, `Registration attempt for ${email} as ${userType}`, ipAddress);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: true,
                                message: 'Verification code sent to your email (expires in 30 seconds)',
                                email: email
                            }));
                        })
                        .catch(error => {
                            console.error('Error sending email:', error.message);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: true,
                                message: 'Verification code generated (check console, expires in 30 seconds)',
                                email: email,
                                developmentCode: verificationCode
                            }));
                        });
                });
            });
        });
    }

    else if (pathname === '/api/register-store' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const formData = JSON.parse(body);

            const requiredFields = [
                'ownerFirstName', 'ownerLastName', 'ownerSSN', 'ownerEmail',
                'storeName', 'storeAddress', 'storeEmail', 'storeFoundingDate',
                'password', 'confirmPassword', 'signature'
            ];

            for (const field of requiredFields) {
                if (!formData[field]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        message: `Field ${field} is required`
                    }));
                    return;
                }
            }

            if (!/^\d{13}$/.test(formData.ownerSSN)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'SSN must be exactly 13 digits'
                }));
                return;
            }

            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

            if (!emailRegex.test(formData.ownerEmail)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'Please enter a valid personal email address'
                }));
                return;
            }

            if (!emailRegex.test(formData.storeEmail)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'Please enter a valid store email address'
                }));
                return;
            }

            if (formData.password !== formData.confirmPassword) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'Passwords do not match'
                }));
                return;
            }

            if (!validatePassword(formData.password)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'Password must have at least 8 characters, including uppercase, lowercase, number and special character'
                }));
                return;
            }

            database.getPersonalByEmail(formData.ownerEmail, (err, existingPersonal) => {
                if (err) {
                    console.error('Error checking personal:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Server error checking personal' }));
                    return;
                }

                if (existingPersonal) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Personal email is already registered' }));
                    return;
                }

                database.database.get(
                    'SELECT store_id FROM store WHERE store_email = $1',
                    [formData.storeEmail],
                    (err, existingStore) => {
                        if (err) {
                            console.error('Error checking store:', err);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Server error checking store' }));
                            return;
                        }

                        if (existingStore) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Store email is already registered' }));
                            return;
                        }

                        // Get the maximum store_id to determine the next store ID
                        database.database.get(
                            'SELECT MAX(store_id) as max_store_num FROM store',
                            [],
                            (err, result) => {
                                if (err) {
                                    console.error('Error getting max store ID:', err);
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'Server error generating store ID' }));
                                    return;
                                }

                                // Next store number is max + 1, starting from 1 if no stores exist
                                let nextStoreNumber = 1;

                                if (result && result.max_store_num) {
                                    // Extract numeric part from store_id (format: XXX)
                                    const maxNum = parseInt(result.max_store_num, 10);
                                    if (!isNaN(maxNum)) {
                                        nextStoreNumber = maxNum + 1;
                                    }
                                }

                                if (nextStoreNumber > 999) {
                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'Maximum store limit reached (999)' }));
                                    return;
                                }

                                // Store ID is padded to 3 digits (VARCHAR)
                                const storeIdPadded = nextStoreNumber.toString().padStart(3, '0');

                                // Personal ID is storeId + '001' (as string for display)
                                const personalId = storeIdPadded + '001';

                                const verificationCode = generateVerificationCode();

                                const tempStoreData = {
                                    personalId: personalId, // VARCHAR for personal table
                                    ownerFirstName: formData.ownerFirstName,
                                    ownerLastName: formData.ownerLastName,
                                    ownerSSN: formData.ownerSSN,
                                    ownerEmail: formData.ownerEmail,
                                    storeId: storeIdPadded, // VARCHAR for store table
                                    storeIdPadded: storeIdPadded,
                                    storeName: formData.storeName,
                                    storeAddress: formData.storeAddress,
                                    storeEmail: formData.storeEmail,
                                    storeFoundingDate: formData.storeFoundingDate,
                                    storeDescription: formData.storeDescription || '',
                                    password: formData.password,
                                    signature: formData.signature,
                                    timestamp: Date.now()
                                };

                                tempStoreRegistrations.set(verificationCode, tempStoreData);
                                verificationCodes.set(formData.ownerEmail, {
                                    code: verificationCode,
                                    timestamp: Date.now(),
                                    storeRegistration: true
                                });

                                console.log(`⏰ Generated store registration verification code for ${formData.ownerEmail}, expires in 30 seconds`);
                                console.log(`🏪 Store ID will be: ${storeIdPadded}`);
                                console.log(`👤 Personal ID will be: ${personalId}`);

                                sendStoreRegistrationEmail(formData.ownerEmail, verificationCode, formData.storeName)
                                    .then(() => {
                                        console.log('✅ Store registration email sent to:', formData.ownerEmail);
                                        database.logAudit(null, 'STORE_REGISTER_ATTEMPT', 'store', null, `Store registration attempt: ${formData.storeName}`, ipAddress);
                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({
                                            success: true,
                                            message: 'Verification code sent to your email (expires in 30 seconds)',
                                            email: formData.ownerEmail,
                                            storeName: formData.storeName
                                        }));
                                    })
                                    .catch(error => {
                                        console.error('Error sending store registration email:', error.message);
                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({
                                            success: true,
                                            message: 'Verification code generated (check console, expires in 30 seconds)',
                                            email: formData.ownerEmail,
                                            storeName: formData.storeName,
                                            developmentCode: verificationCode
                                        }));
                                    });
                            }
                        );
                    }
                );
            });
        });
    }

    else if (pathname === '/api/client-register' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const { firstName, lastName, email, password, address, city, postcode, country, isDefaultAddress } = JSON.parse(body);

            if (!firstName || !lastName || !email || !password) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'First name, last name, email and password are required' }));
                return;
            }

            if (!validateEmail(email)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Email is not valid' }));
                return;
            }

            if (!validatePassword(password)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'Password must have at least 8 characters, including uppercase, lowercase, number and special character'
                }));
                return;
            }

            database.getClientByEmail(email, (err, existingClient) => {
                if (err) {
                    console.error('Error checking client:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Server error checking client' }));
                    return;
                }

                if (existingClient) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Email is already registered' }));
                    return;
                }

                const verificationCode = generateVerificationCode();

                const tempUserData = {
                    username: `${firstName} ${lastName}`,
                    email,
                    password,
                    timestamp: Date.now(),
                    userType: 'client',
                    firstName: firstName,
                    lastName: lastName,
                    address: address || null,
                    city: city || null,
                    postcode: postcode || null,
                    country: country || null,
                    isDefaultAddress: isDefaultAddress || false
                };

                tempUsers.set(verificationCode, tempUserData);
                verificationCodes.set(email, { code: verificationCode, timestamp: Date.now() });

                console.log(`⏰ Generated verification code for client ${email}, expires in 30 seconds`);

                sendVerificationEmail(email, verificationCode)
                    .then(() => {
                        console.log('✅ Verification email sent to:', email);
                        database.logAudit(null, 'CLIENT_REGISTER_ATTEMPT', 'client', null, `Client registration attempt for ${email}`, ipAddress);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'Verification code sent to your email (expires in 30 seconds)',
                            email: email
                        }));
                    })
                    .catch(error => {
                        console.error('Error sending email:', error.message);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'Verification code generated (check console, expires in 30 seconds)',
                            email: email,
                            developmentCode: verificationCode
                        }));
                    });
            });
        });
    }

    else if (pathname === '/api/resend-verification' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const { email } = JSON.parse(body);

            if (!email) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Email is required' }));
                return;
            }

            const existingTempUser = Array.from(tempUsers.values()).find(user => user.email === email);

            if (existingTempUser) {
                const newVerificationCode = generateVerificationCode();

                const tempUserData = {
                    username: existingTempUser.username,
                    email: existingTempUser.email,
                    password: existingTempUser.password,
                    timestamp: Date.now(),
                    userType: existingTempUser.userType,
                    firstName: existingTempUser.firstName || '',
                    lastName: existingTempUser.lastName || '',
                    address: existingTempUser.address || null,
                    city: existingTempUser.city || null,
                    postcode: existingTempUser.postcode || null,
                    country: existingTempUser.country || null,
                    isDefaultAddress: existingTempUser.isDefaultAddress || false
                };

                tempUsers.forEach((value, key) => {
                    if (value.email === email) {
                        tempUsers.delete(key);
                    }
                });

                tempUsers.set(newVerificationCode, tempUserData);
                verificationCodes.set(email, { code: newVerificationCode, timestamp: Date.now() });

                console.log(`🔄 Resent verification code for ${email}, expires in 30 seconds`);

                sendVerificationEmail(email, newVerificationCode)
                    .then(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'New verification code sent to your email (expires in 30 seconds)',
                            email: email
                        }));
                    })
                    .catch(error => {
                        console.error('Error sending email:', error.message);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'New verification code generated (check console, expires in 30 seconds)',
                            email: email,
                            developmentCode: newVerificationCode
                        }));
                    });

                return;
            }

            const existingTempStore = Array.from(tempStoreRegistrations.values()).find(store => store.ownerEmail === email);

            if (existingTempStore) {
                const newVerificationCode = generateVerificationCode();

                const tempStoreData = {
                    personalId: existingTempStore.personalId,
                    ownerFirstName: existingTempStore.ownerFirstName,
                    ownerLastName: existingTempStore.ownerLastName,
                    ownerSSN: existingTempStore.ownerSSN,
                    ownerEmail: existingTempStore.ownerEmail,
                    storeId: existingTempStore.storeId,
                    storeIdPadded: existingTempStore.storeIdPadded,
                    storeName: existingTempStore.storeName,
                    storeAddress: existingTempStore.storeAddress,
                    storeEmail: existingTempStore.storeEmail,
                    storeFoundingDate: existingTempStore.storeFoundingDate,
                    storeDescription: existingTempStore.storeDescription,
                    password: existingTempStore.password,
                    signature: existingTempStore.signature,
                    timestamp: Date.now()
                };

                tempStoreRegistrations.forEach((value, key) => {
                    if (value.ownerEmail === email) {
                        tempStoreRegistrations.delete(key);
                    }
                });

                tempStoreRegistrations.set(newVerificationCode, tempStoreData);
                verificationCodes.set(email, {
                    code: newVerificationCode,
                    timestamp: Date.now(),
                    storeRegistration: true
                });

                console.log(`🔄 Resent store registration verification code for ${email}, expires in 30 seconds`);

                sendStoreRegistrationEmail(email, newVerificationCode, existingTempStore.storeName)
                    .then(() => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'New verification code sent to your email (expires in 30 seconds)',
                            email: email
                        }));
                    })
                    .catch(error => {
                        console.error('Error sending store registration email:', error.message);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'New verification code generated (check console, expires in 30 seconds)',
                            email: email,
                            developmentCode: newVerificationCode
                        }));
                    });

                return;
            }

            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'No pending registration found for this email' }));
        });
    }

    else if (pathname === '/api/verify-email' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const { email, code } = JSON.parse(body);

            if (!email || !code) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'All fields are required' }));
                return;
            }

            const verificationData = verificationCodes.get(email);

            if (verificationData && verificationData.storeRegistration) {
                const tempStoreData = tempStoreRegistrations.get(code);

                if (!tempStoreData || tempStoreData.ownerEmail !== email) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid verification code' }));
                    return;
                }

                if (Date.now() - tempStoreData.timestamp > 30 * 1000) {
                    tempStoreRegistrations.delete(code);
                    verificationCodes.delete(email);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Verification code has expired. Please request a new one.' }));
                    return;
                }

                database.database.run('BEGIN TRANSACTION', (err) => {
                    if (err) {
                        console.error('Error beginning transaction:', err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Server error during registration' }));
                        return;
                    }

                    // Insert into store table (store_id is VARCHAR)
                    database.database.run(
                        'INSERT INTO store (store_id, name, date_of_founding, physical_address, store_email, rating) VALUES ($1, $2, $3, $4, $5, $6)',
                        [
                            tempStoreData.storeId,
                            tempStoreData.storeName,
                            tempStoreData.storeFoundingDate,
                            tempStoreData.storeAddress,
                            tempStoreData.storeEmail,
                            0.0
                        ],
                        function(err) {
                            if (err) {
                                database.database.run('ROLLBACK');
                                console.error('Error inserting store:', err);
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error registering store' }));
                                return;
                            }

                            // Insert into personal table (id is VARCHAR)
                            database.database.run(
                                'INSERT INTO personal (id, first_name, last_name, ssn, email, password) VALUES ($1, $2, $3, $4, $5, $6)',
                                [
                                    tempStoreData.personalId,
                                    tempStoreData.ownerFirstName,
                                    tempStoreData.ownerLastName,
                                    tempStoreData.ownerSSN,
                                    tempStoreData.ownerEmail,
                                    bcrypt.hashSync(tempStoreData.password, 10)
                                ],
                                function(err) {
                                    if (err) {
                                        database.database.run('ROLLBACK');
                                        console.error('Error inserting personal:', err);

                                        if (err.code === '23505') {
                                            res.writeHead(400, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({
                                                success: false,
                                                message: 'This personal ID is already taken. Please try again.'
                                            }));
                                        } else {
                                            res.writeHead(400, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Error registering personal information' }));
                                        }
                                        return;
                                    }

                                    // Insert into boss table (boss_id is VARCHAR, references personal.id)
                                    database.database.run(
                                        'INSERT INTO boss (boss_id) VALUES ($1)',
                                        [tempStoreData.personalId],
                                        (err) => {
                                            if (err) {
                                                database.database.run('ROLLBACK');
                                                console.error('Error inserting boss:', err);
                                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                                res.end(JSON.stringify({ success: false, message: 'Error registering as boss' }));
                                                return;
                                            }

                                            // Insert into works_in_store table (personal_id is VARCHAR, store_id is VARCHAR)
                                            database.database.run(
                                                'INSERT INTO works_in_store (personal_id, store_id) VALUES ($1, $2)',
                                                [tempStoreData.personalId, tempStoreData.storeId],
                                                (err) => {
                                                    if (err) {
                                                        database.database.run('ROLLBACK');
                                                        console.error('Error inserting works_in_store:', err);
                                                        res.writeHead(400, { 'Content-Type': 'application/json' });
                                                        res.end(JSON.stringify({ success: false, message: 'Error assigning to store' }));
                                                        return;
                                                    }

                                                    // Insert into permissions table (personal_id is VARCHAR)
                                                    database.database.run(
                                                        'INSERT INTO permissions (personal_id, type, authorisation) VALUES ($1, $2, $3)',
                                                        [tempStoreData.personalId, 'BOSS', 'full_access'],
                                                        (err) => {
                                                            if (err) {
                                                                console.error('Error inserting permissions:', err);
                                                            }

                                                            // Also create entry in users table for login with force_password_change = 1
                                                            database.database.run(
                                                                'INSERT INTO users (id, username, email, password, user_type, force_password_change) VALUES ($1, $2, $3, $4, $5, $6)',
                                                                [
                                                                    tempStoreData.personalId,
                                                                    `${tempStoreData.ownerFirstName} ${tempStoreData.ownerLastName}`,
                                                                    tempStoreData.ownerEmail,
                                                                    bcrypt.hashSync(tempStoreData.password, 10),
                                                                    'store_owner',
                                                                    1
                                                                ],
                                                                (err) => {
                                                                    if (err) {
                                                                        console.error('Error creating user entry for store owner:', err);
                                                                    }

                                                                    database.database.run('COMMIT', (commitErr) => {
                                                                        if (commitErr) {
                                                                            console.error('Error committing transaction:', commitErr);
                                                                            database.database.run('ROLLBACK');
                                                                            res.writeHead(500, { 'Content-Type': 'application/json' });
                                                                            res.end(JSON.stringify({ success: false, message: 'Error completing registration' }));
                                                                            return;
                                                                        }

                                                                        tempStoreRegistrations.delete(code);
                                                                        verificationCodes.delete(email);

                                                                        console.log(`✅ Store registration completed successfully:`);
                                                                        console.log(`   Store ID: ${tempStoreData.storeId}`);
                                                                        console.log(`   Store Name: ${tempStoreData.storeName}`);
                                                                        console.log(`   Personal ID: ${tempStoreData.personalId}`);
                                                                        console.log(`   Owner: ${tempStoreData.ownerFirstName} ${tempStoreData.ownerLastName}`);

                                                                        database.logAudit(tempStoreData.personalId, 'STORE_REGISTER_SUCCESS', 'store', tempStoreData.storeId, `Store registered: ${tempStoreData.storeName}`, ipAddress);

                                                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                        res.end(JSON.stringify({
                                                                            success: true,
                                                                            message: 'Store registration successful! You can now login.',
                                                                            storeId: tempStoreData.storeId,
                                                                            storeIdPadded: tempStoreData.storeIdPadded,
                                                                            storeName: tempStoreData.storeName,
                                                                            personalId: tempStoreData.personalId,
                                                                            userType: 'store_owner',
                                                                            redirectTo: 'login.html'
                                                                        }));
                                                                    });
                                                                }
                                                            );
                                                        }
                                                    );
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                });

                return;
            }

            const tempUserData = tempUsers.get(code);

            if (!tempUserData || tempUserData.email !== email) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid verification code' }));
                return;
            }

            if (Date.now() - tempUserData.timestamp > 30 * 1000) {
                tempUsers.delete(code);
                verificationCodes.delete(email);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Verification code has expired. Please request a new one.' }));
                return;
            }

            if (tempUserData.userType === 'client') {
                database.createClient({
                    first_name: tempUserData.firstName || tempUserData.username.split(' ')[0] || '',
                    last_name: tempUserData.lastName || tempUserData.username.split(' ')[1] || '',
                    email: tempUserData.email,
                    password: tempUserData.password
                }, (err, clientId) => {
                    if (err) {
                        console.error('Error creating client:', err);
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Registration failed' }));
                    } else {
                        if (tempUserData.address && tempUserData.city && tempUserData.postcode && tempUserData.country) {
                            database.database.run(
                                'INSERT INTO delivery_address (client_id, address, city, postcode, country, is_default) VALUES ($1, $2, $3, $4, $5, $6)',
                                [
                                    clientId,
                                    tempUserData.address,
                                    tempUserData.city,
                                    tempUserData.postcode,
                                    tempUserData.country,
                                    tempUserData.isDefaultAddress ? 1 : 0
                                ],
                                (err) => {
                                    if (err) {
                                        console.error('Error saving delivery address:', err);
                                    }
                                }
                            );
                        }

                        tempUsers.delete(code);
                        verificationCodes.delete(email);

                        database.logAudit(clientId, 'REGISTER_SUCCESS', 'client', clientId.toString(), 'Client registered', ipAddress);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'Successfully registered! You can now login.',
                            userId: clientId,
                            userType: 'client',
                            redirectTo: 'login.html'
                        }));
                    }
                });
            } else {
                const userId = 'user_' + Date.now().toString().slice(-8);

                database.createUser(userId, tempUserData.username, tempUserData.email, tempUserData.password, tempUserData.userType, (err, userId) => {
                    if (err) {
                        console.error('Error creating user:', err);
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Registration failed' }));
                    } else {
                        tempUsers.delete(code);
                        verificationCodes.delete(email);

                        database.logAudit(userId, 'REGISTER_SUCCESS', 'user', userId.toString(), `User registered as ${tempUserData.userType}`, ipAddress);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'Successfully registered! You can now login.',
                            userId: userId,
                            userType: tempUserData.userType,
                            redirectTo: 'login.html'
                        }));
                    }
                });
            }
        });
    }

    else if (pathname === '/api/login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const { email, password } = JSON.parse(body);

            console.log(`🔍 Login attempt for email: ${email}`);

            // First check if it's the admin user (special case)
            if (email === 'admin@handcraft.com') {
                database.getUserByUsername('admin', (err, adminUser) => {
                    if (err || !adminUser) {
                        console.error('Admin user not found');
                        database.logAudit(null, 'LOGIN_FAILED', 'auth', null, `Admin login failed - user not found`, ipAddress);
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                        return;
                    }

                    if (database.verifyPassword(password, adminUser.password)) {
                        const isFirstTimeLogin = adminUser.force_password_change === 1;

                        const twoFACode = generateVerificationCode();
                        verificationCodes.set(adminUser.email, {
                            code: twoFACode,
                            timestamp: Date.now(),
                            userId: adminUser.id,
                            isFirstTimeLogin: isFirstTimeLogin,
                            userType: 'admin',
                            needsPasswordChange: isFirstTimeLogin
                        });

                        console.log(`⏰ Generated 2FA code for admin ${adminUser.email}`);

                        send2FACode(adminUser.email, twoFACode)
                            .then(() => {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    success: true,
                                    message: 'Two-factor authentication code sent to your email',
                                    requires2FA: true,
                                    email: adminUser.email,
                                    username: adminUser.username,
                                    isFirstTimeLogin: isFirstTimeLogin,
                                    userType: 'admin'
                                }));
                            })
                            .catch(error => {
                                console.error('Error sending 2FA email:', error);
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    success: true,
                                    message: 'Two-factor authentication required',
                                    requires2FA: true,
                                    email: adminUser.email,
                                    username: adminUser.username,
                                    isFirstTimeLogin: isFirstTimeLogin,
                                    userType: 'admin',
                                    developmentCode: twoFACode
                                }));
                            });
                    } else {
                        database.logAudit(adminUser.id, 'LOGIN_FAILED', 'auth', adminUser.id.toString(), 'Invalid password for admin', ipAddress);
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                    }
                });

                return;
            }

            // First check if it's a client
            database.getClientByEmail(email, (err, client) => {
                if (err) {
                    console.error('Error checking client:', err);
                }

                if (client) {
                    console.log(`🔍 Found client: ${client.email}`);

                    if (!client.password) {
                        console.log('❌ Client has no password set');
                        database.logAudit(client.client_ID, 'LOGIN_FAILED', 'auth', client.client_ID?.toString() || 'unknown', 'Client has no password', ipAddress);
                        res.writeHead(401, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                        return;
                    }

                    database.verifyClientPassword(password, client.password, (err, isValid) => {
                        if (err || !isValid) {
                            const clientId = client.client_ID || 'unknown';
                            database.logAudit(clientId, 'LOGIN_FAILED', 'auth',
                                typeof clientId === 'string' ? clientId : String(clientId),
                                'Invalid password for client', ipAddress);
                            res.writeHead(401, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                            return;
                        }

                        // Clients go directly to dashboard (no 2FA)
                        const sessionId = generateSessionId();
                        const clientId = client.client_ID;
                        sessions.set(sessionId, `client_${clientId}`);

                        console.log(`✅ Client login successful. Session: ${sessionId}, User: client_${clientId}`);

                        database.logAudit(clientId, 'LOGIN_SUCCESS', 'auth',
                            typeof clientId === 'string' ? clientId : String(clientId),
                            'Client logged in successfully', ipAddress);

                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Set-Cookie': `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`
                        });

                        res.end(JSON.stringify({
                            success: true,
                            message: 'Successfully logged in',
                            user: {
                                id: clientId,
                                firstName: client.first_name,
                                lastName: client.last_name,
                                email: client.email,
                                userType: 'client'
                            },
                            redirectTo: 'client-dashboard.html'
                        }));
                    });

                    return;
                }

                // If not client, check personal table
                database.getPersonalByEmail(email, (err, personal) => {
                    if (err) {
                        console.error('Error checking personal:', err);
                    }

                    if (personal) {
                        console.log(`🔍 Found personal user: ${personal.email}`);

                        if (!personal.password) {
                            console.log('❌ Personal has no password set');
                            database.logAudit(personal.id, 'LOGIN_FAILED', 'auth', personal.id, 'Personal has no password', ipAddress);
                            res.writeHead(401, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                            return;
                        }

                        database.verifyClientPassword(password, personal.password, (err, isValid) => {
                            if (err || !isValid) {
                                database.logAudit(personal.id, 'LOGIN_FAILED', 'auth', personal.id, 'Invalid password for personal', ipAddress);
                                res.writeHead(401, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                                return;
                            }

                            // Check if this is a boss (store owner)
                            database.database.get(
                                'SELECT boss_id FROM boss WHERE boss_id = $1',
                                [personal.id],
                                (err, boss) => {
                                    if (err) {
                                        console.error('Error checking boss status:', err);
                                    }

                                    if (boss) {
                                        // This is a store owner
                                        // Check if first time login from users table
                                        database.database.get(
                                            'SELECT force_password_change FROM users WHERE email = $1',
                                            [email],
                                            (err, user) => {
                                                const isFirstTimeLogin = user && user.force_password_change === 1;

                                                const twoFACode = generateVerificationCode();
                                                verificationCodes.set(personal.email, {
                                                    code: twoFACode,
                                                    timestamp: Date.now(),
                                                    userId: personal.id,
                                                    isFirstTimeLogin: isFirstTimeLogin,
                                                    userType: 'store_owner',
                                                    needsPasswordChange: isFirstTimeLogin
                                                });

                                                console.log(`⏰ Generated 2FA code for store owner ${personal.email}`);

                                                send2FACode(personal.email, twoFACode)
                                                    .then(() => {
                                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                                        res.end(JSON.stringify({
                                                            success: true,
                                                            message: 'Two-factor authentication code sent to your email',
                                                            requires2FA: true,
                                                            email: personal.email,
                                                            isFirstTimeLogin: isFirstTimeLogin,
                                                            userType: 'store_owner'
                                                        }));
                                                    })
                                                    .catch(error => {
                                                        console.error('Error sending 2FA email:', error);
                                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                                        res.end(JSON.stringify({
                                                            success: true,
                                                            message: 'Two-factor authentication required',
                                                            requires2FA: true,
                                                            email: personal.email,
                                                            isFirstTimeLogin: isFirstTimeLogin,
                                                            userType: 'store_owner',
                                                            developmentCode: twoFACode
                                                        }));
                                                    });
                                            }
                                        );

                                        return;
                                    }

                                    // Check if this is an employee
                                    database.database.get(
                                        'SELECT employee_id FROM employees WHERE employee_id = $1',
                                        [personal.id],
                                        (err, employee) => {
                                            if (err) {
                                                console.error('Error checking employee status:', err);
                                            }

                                            if (employee) {
                                                // This is an employee
                                                database.database.get(
                                                    'SELECT force_password_change FROM users WHERE email = $1',
                                                    [email],
                                                    (err, user) => {
                                                        const isFirstTimeLogin = user && user.force_password_change === 1;

                                                        const twoFACode = generateVerificationCode();
                                                        verificationCodes.set(personal.email, {
                                                            code: twoFACode,
                                                            timestamp: Date.now(),
                                                            userId: personal.id,
                                                            isFirstTimeLogin: isFirstTimeLogin,
                                                            userType: 'store_employee',
                                                            needsPasswordChange: isFirstTimeLogin
                                                        });

                                                        console.log(`⏰ Generated 2FA code for employee ${personal.email}`);

                                                        send2FACode(personal.email, twoFACode)
                                                            .then(() => {
                                                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                res.end(JSON.stringify({
                                                                    success: true,
                                                                    message: 'Two-factor authentication code sent to your email',
                                                                    requires2FA: true,
                                                                    email: personal.email,
                                                                    isFirstTimeLogin: isFirstTimeLogin,
                                                                    userType: 'store_employee'
                                                                }));
                                                            })
                                                            .catch(error => {
                                                                console.error('Error sending 2FA email:', error);
                                                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                res.end(JSON.stringify({
                                                                    success: true,
                                                                    message: 'Two-factor authentication required',
                                                                    requires2FA: true,
                                                                    email: personal.email,
                                                                    isFirstTimeLogin: isFirstTimeLogin,
                                                                    userType: 'store_employee',
                                                                    developmentCode: twoFACode
                                                                }));
                                                            });
                                                    }
                                                );

                                                return;
                                            }

                                            // If we get here, it's a personal record without boss/employee status
                                            // Treat as regular user
                                            database.database.get(
                                                'SELECT * FROM users WHERE email = $1',
                                                [email],
                                                (err, user) => {
                                                    if (err || !user) {
                                                        database.getUserByUsername(email, (err, userByUsername) => {
                                                            if (err || !userByUsername) {
                                                                database.logAudit(null, 'LOGIN_FAILED', 'auth', null, `Failed login attempt for email: ${email}`, ipAddress);
                                                                res.writeHead(401, { 'Content-Type': 'application/json' });
                                                                res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                                                                return;
                                                            }

                                                            if (database.verifyPassword(password, userByUsername.password)) {
                                                                const isFirstTimeLogin = userByUsername.force_password_change === 1;

                                                                const twoFACode = generateVerificationCode();
                                                                verificationCodes.set(userByUsername.email, {
                                                                    code: twoFACode,
                                                                    timestamp: Date.now(),
                                                                    userId: userByUsername.id,
                                                                    isFirstTimeLogin: isFirstTimeLogin,
                                                                    userType: userByUsername.user_type,
                                                                    needsPasswordChange: isFirstTimeLogin
                                                                });

                                                                send2FACode(userByUsername.email, twoFACode)
                                                                    .then(() => {
                                                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                        res.end(JSON.stringify({
                                                                            success: true,
                                                                            message: 'Two-factor authentication code sent to your email',
                                                                            requires2FA: true,
                                                                            email: userByUsername.email,
                                                                            username: userByUsername.username,
                                                                            isFirstTimeLogin: isFirstTimeLogin,
                                                                            userType: userByUsername.user_type
                                                                        }));
                                                                    })
                                                                    .catch(error => {
                                                                        console.error('Error sending 2FA email:', error);
                                                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                        res.end(JSON.stringify({
                                                                            success: true,
                                                                            message: 'Two-factor authentication required',
                                                                            requires2FA: true,
                                                                            email: userByUsername.email,
                                                                            username: userByUsername.username,
                                                                            isFirstTimeLogin: isFirstTimeLogin,
                                                                            userType: userByUsername.user_type,
                                                                            developmentCode: twoFACode
                                                                        }));
                                                                    });
                                                            } else {
                                                                database.logAudit(userByUsername.id, 'LOGIN_FAILED', 'auth', userByUsername.id.toString(), 'Invalid password', ipAddress);
                                                                res.writeHead(401, { 'Content-Type': 'application/json' });
                                                                res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                                                            }
                                                        });

                                                        return;
                                                    }

                                                    if (database.verifyPassword(password, user.password)) {
                                                        const isFirstTimeLogin = user.force_password_change === 1;

                                                        const twoFACode = generateVerificationCode();
                                                        verificationCodes.set(user.email, {
                                                            code: twoFACode,
                                                            timestamp: Date.now(),
                                                            userId: user.id,
                                                            isFirstTimeLogin: isFirstTimeLogin,
                                                            userType: user.user_type,
                                                            needsPasswordChange: isFirstTimeLogin
                                                        });

                                                        send2FACode(user.email, twoFACode)
                                                            .then(() => {
                                                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                res.end(JSON.stringify({
                                                                    success: true,
                                                                    message: 'Two-factor authentication code sent to your email',
                                                                    requires2FA: true,
                                                                    email: user.email,
                                                                    username: user.username,
                                                                    isFirstTimeLogin: isFirstTimeLogin,
                                                                    userType: user.user_type
                                                                }));
                                                            })
                                                            .catch(error => {
                                                                console.error('Error sending 2FA email:', error);
                                                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                res.end(JSON.stringify({
                                                                    success: true,
                                                                    message: 'Two-factor authentication required',
                                                                    requires2FA: true,
                                                                    email: user.email,
                                                                    username: user.username,
                                                                    isFirstTimeLogin: isFirstTimeLogin,
                                                                    userType: user.user_type,
                                                                    developmentCode: twoFACode
                                                                }));
                                                            });
                                                    } else {
                                                        database.logAudit(user.id, 'LOGIN_FAILED', 'auth', user.id.toString(), 'Invalid password', ipAddress);
                                                        res.writeHead(401, { 'Content-Type': 'application/json' });
                                                        res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                                                    }
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        });

                        return;
                    }

                    // No user found in any table
                    database.logAudit(null, 'LOGIN_FAILED', 'auth', null, `Failed login attempt for email: ${email}`, ipAddress);
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid email or password' }));
                });
            });
        });
    }

    else if (pathname === '/api/resend-2fa' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const { email } = JSON.parse(body);

            if (!email) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Email is required' }));
                return;
            }

            database.database.get(
                'SELECT * FROM users WHERE email = $1',
                [email],
                (err, user) => {
                    if (err || !user) {
                        database.getUserByUsername(email, (err, userByUsername) => {
                            if (err || !userByUsername) {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'User not found' }));
                                return;
                            }

                            const newTwoFACode = generateVerificationCode();
                            verificationCodes.set(userByUsername.email, {
                                code: newTwoFACode,
                                timestamp: Date.now(),
                                userId: userByUsername.id,
                                isFirstTimeLogin: userByUsername.force_password_change === 1,
                                needsPasswordChange: userByUsername.force_password_change === 1,
                                userType: userByUsername.user_type
                            });

                            console.log(`🔄 Resent 2FA code for ${userByUsername.email}, expires in 30 seconds`);

                            send2FACode(userByUsername.email, newTwoFACode)
                                .then(() => {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({
                                        success: true,
                                        message: 'New two-factor authentication code sent to your email (expires in 30 seconds)',
                                        email: userByUsername.email
                                    }));
                                })
                                .catch(error => {
                                    console.error('Error sending 2FA email:', error.message);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({
                                        success: true,
                                        message: 'New two-factor authentication code generated (check console, expires in 30 seconds)',
                                        email: userByUsername.email,
                                        developmentCode: newTwoFACode
                                    }));
                                });
                        });

                        return;
                    }

                    const newTwoFACode = generateVerificationCode();
                    verificationCodes.set(user.email, {
                        code: newTwoFACode,
                        timestamp: Date.now(),
                        userId: user.id,
                        isFirstTimeLogin: user.force_password_change === 1,
                        needsPasswordChange: user.force_password_change === 1,
                        userType: user.user_type
                    });

                    console.log(`🔄 Resent 2FA code for ${user.email}, expires in 30 seconds`);

                    send2FACode(user.email, newTwoFACode)
                        .then(() => {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: true,
                                message: 'New two-factor authentication code sent to your email (expires in 30 seconds)',
                                email: user.email
                            }));
                        })
                        .catch(error => {
                            console.error('Error sending 2FA email:', error.message);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: true,
                                message: 'New two-factor authentication code generated (check console, expires in 30 seconds)',
                                email: user.email,
                                developmentCode: newTwoFACode
                            }));
                        });
                }
            );
        });
    }

    else if (pathname === '/api/verify-2fa' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const { email, code } = JSON.parse(body);

            if (!email || !code) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'All fields are required' }));
                return;
            }

            const verificationData = verificationCodes.get(email);

            if (!verificationData || verificationData.code !== code) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid two-factor authentication code' }));
                return;
            }

            if (Date.now() - verificationData.timestamp > 30 * 1000) {
                verificationCodes.delete(email);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Two-factor authentication code has expired. Please request a new one.' }));
                return;
            }

            // Check if this is a first-time login that requires password change
            if (verificationData.needsPasswordChange) {
                const tempSessionId = generateSessionId();
                tempAdminSessions.set(tempSessionId, verificationData.userId);

                database.logAudit(verificationData.userId, 'LOGIN_2FA_SUCCESS_PASSWORD_CHANGE_REQUIRED', 'auth', verificationData.userId.toString(),
                    `${verificationData.userType} first login, password change required`, ipAddress);

                verificationCodes.delete(email);

                // Determine redirect based on user type
                let redirectTo = 'change-password.html?forced=true';
                if (verificationData.userType === 'store_owner') {
                    redirectTo = 'change-password.html?forced=true&redirect=store-owner.html';
                } else if (verificationData.userType === 'store_employee') {
                    redirectTo = 'change-password.html?forced=true&redirect=store-employee.html';
                } else if (verificationData.userType === 'admin') {
                    redirectTo = 'change-password.html?forced=true&redirect=admin.html';
                } else if (verificationData.userType === 'client') {
                    redirectTo = 'change-password.html?forced=true&redirect=client-dashboard.html';
                }

                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Set-Cookie': `sessionId=${tempSessionId}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`
                });

                res.end(JSON.stringify({
                    success: true,
                    message: 'Two-factor authentication successful. Password change required.',
                    requiresPasswordChange: true,
                    userType: verificationData.userType,
                    redirectTo: redirectTo
                }));

                return;
            }

            // Regular login - create session and redirect based on user type
            const sessionId = generateSessionId();

            // Determine how to store the user ID in session
            if (verificationData.userType === 'client') {
                sessions.set(sessionId, `client_${verificationData.userId}`);
            } else if (verificationData.userType === 'store_owner' || verificationData.userType === 'store_employee') {
                sessions.set(sessionId, `personal_${verificationData.userId}`);
            } else {
                sessions.set(sessionId, verificationData.userId.toString());
            }

            verificationCodes.delete(email);

            database.logAudit(verificationData.userId, 'LOGIN_SUCCESS', 'auth', verificationData.userId.toString(),
                `${verificationData.userType} logged in successfully`, ipAddress);

            // Determine redirect based on user type
            let redirectTo = '';

            switch(verificationData.userType) {
                case 'client':
                    redirectTo = 'client-dashboard.html';
                    break;
                case 'store_owner':
                    redirectTo = 'store-owner.html';
                    break;
                case 'store_employee':
                    redirectTo = 'store-employee.html';
                    break;
                case 'admin':
                    redirectTo = 'admin.html';
                    break;
                default:
                    redirectTo = 'dashboard.html';
            }

            console.log(`✅ ${verificationData.userType} login successful. Redirecting to: ${redirectTo}`);

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Set-Cookie': `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`
            });

            res.end(JSON.stringify({
                success: true,
                message: 'Successfully logged in',
                userType: verificationData.userType,
                redirectTo: redirectTo
            }));
        });
    }

    else if (pathname === '/api/logout' && req.method === 'POST') {
        const cookies = parseCookies(req);
        const sessionId = cookies.sessionId;

        if (sessionId) {
            const userId = sessions.get(sessionId);
            if (userId) {
                database.logAudit(userId, 'LOGOUT', 'auth', userId.toString(), 'User logged out', ipAddress);
            }
            sessions.delete(sessionId);
            tempAdminSessions.delete(sessionId);
        }

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': 'sessionId=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
        });

        res.end(JSON.stringify({ success: true, message: 'Successfully logged out' }));
    }

    else if (pathname === '/api/user' && req.method === 'GET') {
        requireAuth(req, res, (userId) => {
            const cookies = parseCookies(req);
            const sessionId = cookies.sessionId;

            if (tempAdminSessions.has(sessionId)) {
                // This is a temporary session (password change required)
                // Get user info to determine type
                database.getUserById(userId, (err, user) => {
                    if (err || !user) {
                        // Check if it's a personal user
                        database.getPersonalById(userId, (err, personal) => {
                            if (err || !personal) {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    success: true,
                                    user: {
                                        id: userId,
                                        username: 'admin',
                                        userType: 'admin',
                                        needsPasswordChange: true
                                    },
                                    isTempSession: true
                                }));
                            } else {
                                // Personal user (store owner/employee)
                                database.database.get(
                                    'SELECT boss_id FROM boss WHERE boss_id = $1',
                                    [userId],
                                    (err, boss) => {
                                        let userType = 'store_employee';
                                        if (boss) {
                                            userType = 'store_owner';
                                        }

                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({
                                            success: true,
                                            user: {
                                                id: personal.id,
                                                firstName: personal.first_name,
                                                lastName: personal.last_name,
                                                email: personal.email,
                                                userType: userType,
                                                needsPasswordChange: true
                                            },
                                            isTempSession: true
                                        }));
                                    }
                                );
                            }
                        });
                    } else {
                        // Regular user (admin)
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            user: {
                                id: user.id,
                                username: user.username,
                                email: user.email,
                                userType: user.user_type || 'admin',
                                needsPasswordChange: true
                            },
                            isTempSession: true
                        }));
                    }
                });

                return;
            }

            // Regular session
            const userIdStr = String(userId);

            if (userIdStr === '000000') {
                // Admin user
                database.getUserById(userIdStr, (err, user) => {
                    if (err || !user) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'User not found' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            user: {
                                id: user.id,
                                username: user.username,
                                email: user.email,
                                userType: 'admin'
                            }
                        }));
                    }
                });
            }
            else if (userIdStr.startsWith('client_')) {
                const clientId = parseInt(userIdStr.replace('client_', ''));

                database.getClientById(clientId, (err, client) => {
                    if (err || !client) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'User not found' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            user: {
                                id: client.client_ID,
                                firstName: client.first_name,
                                lastName: client.last_name,
                                email: client.email,
                                userType: 'client'
                            }
                        }));
                    }
                });
            }
            else if (userIdStr.startsWith('personal_')) {
                const personalId = userIdStr.replace('personal_', '');

                database.getPersonalById(personalId, (err, personal) => {
                    if (err || !personal) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'User not found' }));
                        return;
                    }

                    database.database.get(
                        'SELECT boss_id FROM boss WHERE boss_id = $1',
                        [personalId],
                        (err, boss) => {
                            if (err) {
                                console.error('Error checking boss:', err);
                            }

                            if (boss) {
                                database.database.all(
                                    `SELECT s.* FROM store s
                                                         JOIN works_in_store w ON s.store_id = w.store_id
                                     WHERE w.personal_id = $1`,
                                    [personalId],
                                    (err, stores) => {
                                        if (err) {
                                            console.error('Error getting stores:', err);
                                            stores = [];
                                        }

                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({
                                            success: true,
                                            user: {
                                                id: personal.id,
                                                firstName: personal.first_name,
                                                lastName: personal.last_name,
                                                email: personal.email,
                                                userType: 'store_owner',
                                                stores: stores
                                            }
                                        }));
                                    }
                                );
                            } else {
                                database.database.get(
                                    'SELECT employee_id FROM employees WHERE employee_id = $1',
                                    [personalId],
                                    (err, employee) => {
                                        if (err) {
                                            console.error('Error checking employee:', err);
                                        }

                                        if (employee) {
                                            database.database.all(
                                                `SELECT s.* FROM store s
                                                                     JOIN works_in_store w ON s.store_id = w.store_id
                                                 WHERE w.personal_id = $1`,
                                                [personalId],
                                                (err, stores) => {
                                                    if (err) {
                                                        console.error('Error getting stores:', err);
                                                        stores = [];
                                                    }

                                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                                    res.end(JSON.stringify({
                                                        success: true,
                                                        user: {
                                                            id: personal.id,
                                                            firstName: personal.first_name,
                                                            lastName: personal.last_name,
                                                            email: personal.email,
                                                            userType: 'store_employee',
                                                            stores: stores
                                                        }
                                                    }));
                                                }
                                            );
                                        } else {
                                            res.writeHead(404, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'User type not recognized' }));
                                        }
                                    }
                                );
                            }
                        }
                    );
                });
            } else {
                database.getUserById(userIdStr, (err, user) => {
                    if (err || !user) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'User not found' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, user }));
                    }
                });
            }
        });
    }

    else if (pathname === '/api/products' && req.method === 'GET') {
        const query = parsedUrl.query;
        const categoryId = query.category;
        const searchTerm = query.search;

        database.getProducts(categoryId, searchTerm, (err, products) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Error fetching products' }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, products }));
            }
        });
    }

    else if (pathname === '/api/product' && req.method === 'GET') {
        const productId = parsedUrl.query.id;

        if (!productId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Product ID is required' }));
            return;
        }

        database.getProductById(productId, (err, product) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Error fetching product' }));
            } else if (!product) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Product not found' }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, product }));
            }
        });
    }

    else if (pathname === '/api/create-category' && req.method === 'POST') {
        requireStoreOwner()(req, res, (personalId) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const categoryData = JSON.parse(body);

                if (!categoryData.name || !categoryData.name.trim()) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Category name is required' }));
                    return;
                }

                const dbCategoryData = {
                    name: categoryData.name.trim(),
                    description: (categoryData.description || '').trim(),
                    parent_id: categoryData.parentId ? parseInt(categoryData.parentId) : null
                };

                database.createCategory(dbCategoryData, (err, category) => {
                    if (err) {
                        console.error('Error creating category:', err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Error creating category: ' + err.message }));
                    } else if (!category) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Failed to create category' }));
                    } else {
                        database.logAudit(personalId, 'CATEGORY_CREATED', 'category', category.id.toString(), `New category created: ${category.name}`, ipAddress);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: 'Category created successfully',
                            category: {
                                id: category.id,
                                name: category.name,
                                parent_id: category.parent_category_id,
                                description: category.description
                            }
                        }));
                    }
                });
            });
        });
    }

    else if (pathname === '/api/categories' && req.method === 'GET') {
        database.getCategoriesWithParents((err, categories) => {
            if (err) {
                console.error('Error fetching categories:', err);
                database.getCategories((err, categories) => {
                    if (err) {
                        console.error('Error fetching categories (fallback):', err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Error fetching categories' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, categories: categories || [] }));
                    }
                });
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, categories: categories || [] }));
            }
        });
    }

    else if (pathname === '/api/stores' && req.method === 'GET') {
        database.getStores((err, stores) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Error fetching stores' }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, stores }));
            }
        });
    }

    else if (pathname === '/api/create-order' && req.method === 'POST') {
        requireAuth(req, res, (userId) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const orderData = JSON.parse(body);
                const userIdStr = String(userId);

                if (userIdStr.startsWith('client_')) {
                    const clientId = parseInt(userIdStr.replace('client_', ''));
                    const storeId = orderData.storeId;

                    if (!storeId) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                        return;
                    }

                    const year = new Date().getFullYear().toString().slice(-3);

                    database.database.get(
                        'SELECT COUNT(*) AS order_count FROM "order" WHERE LEFT(order_num,3) = $1 AND SUBSTRING(order_num FROM 4 FOR 3)::INTEGER = ($2::INTEGER % 1000)',
                        [storeId, new Date().getFullYear().toString()],
                        (err, result) => {
                            if (err) {
                                console.error('Error counting orders:', err);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error generating order ID' }));
                                return;
                            }

                            const orderCount = result ? result.order_count + 1 : 1;
                            const orderNumPadded = orderCount.toString().padStart(5, '0');

                            // Format order number: storeId + year (3 digits) + orderNum (5 digits)
                            const orderNum = storeId + year + orderNumPadded;

                            const newOrderData = {
                                order_num: orderNum,
                                client_id: clientId,
                                store_id: storeId,
                                quantity: orderData.items.reduce((sum, item) => sum + item.quantity, 0),
                                payment_method: orderData.paymentMethod || 'credit card',
                                discount: orderData.discount || 0,
                                delivery_address: orderData.deliveryAddress || 'Not specified',
                                items: orderData.items.map(item => ({
                                    product_code: item.productCode,
                                    quantity: item.quantity,
                                    price: item.price
                                }))
                            };

                            database.createOrderNew(newOrderData, (err, orderId) => {
                                if (err) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'Error creating order' }));
                                } else {
                                    database.logAudit(clientId, 'ORDER_CREATED', 'order', orderId.toString(), 'New order created', ipAddress);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, orderId, message: 'Order created successfully' }));
                                }
                            });
                        }
                    );
                } else {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Only clients can create orders' }));
                }
            });
        });
    }

    else if (pathname === '/api/user-orders' && req.method === 'GET') {
        requireAuth(req, res, (userId) => {
            const userIdStr = String(userId);

            if (userIdStr.startsWith('client_')) {
                const clientId = parseInt(userIdStr.replace('client_', ''));

                database.getOrdersByClient(clientId, (err, orders) => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Error fetching orders' }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, orders }));
                    }
                });
            } else {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only clients can view orders' }));
            }
        });
    }

    else if (pathname === '/api/create-review' && req.method === 'POST') {
        requireAuth(req, res, (userId) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const reviewData = JSON.parse(body);
                const userIdStr = String(userId);

                if (userIdStr.startsWith('client_')) {
                    const clientId = parseInt(userIdStr.replace('client_', ''));
                    reviewData.client_id = clientId;

                    database.createReviewNew(reviewData, (err, reviewId) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Error creating review' }));
                        } else {
                            database.logAudit(clientId, 'REVIEW_CREATED', 'review', reviewId.toString(), 'New review created', ipAddress);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, reviewId, message: 'Review created successfully' }));
                        }
                    });
                } else {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Only clients can create reviews' }));
                }
            });
        });
    }

    else if (pathname === '/api/create-request' && req.method === 'POST') {
        requireAuth(req, res, (userId) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const requestData = JSON.parse(body);
                const userIdStr = String(userId);

                if (userIdStr.startsWith('client_')) {
                    const clientId = parseInt(userIdStr.replace('client_', ''));
                    const storeId = requestData.storeId;

                    if (!storeId) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                        return;
                    }

                    const now = new Date();
                    const month = (now.getMonth() + 1).toString().padStart(2, '0');
                    const year = now.getFullYear().toString().slice(-3);

                    database.database.get(
                        'SELECT COUNT(*)::int AS request_count FROM request r JOIN for_store fs ON fs.request_num=r.request_num WHERE fs.store_ID = $1 AND EXTRACT(YEAR FROM r.date_and_time)::int = $2::int AND EXTRACT(MONTH FROM r.date_and_time)::int = $3::int',
                        [storeId, now.getFullYear().toString(), (now.getMonth() + 1).toString().padStart(2, '0')],
                        (err, result) => {
                            if (err) {
                                console.error('Error counting requests:', err);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error generating request ID' }));
                                return;
                            }

                            const requestCount = result ? result.request_count + 1 : 1;
                            const requestSeqPadded = requestCount.toString().padStart(2, '0');

                            // Format request number: storeId + month (2 digits) + year (3 digits) + clientId + seq (2 digits)
                            const requestNum = storeId + month + year + clientId + requestSeqPadded;

                            const newRequestData = {
                                request_num: requestNum,
                                date_and_time: now.toISOString(),
                                problem: requestData.problem,
                                client_id: clientId,
                                store_id: storeId
                            };

                            database.createRequest(newRequestData, (err, requestId) => {
                                if (err) {
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'Error creating request' }));
                                } else {
                                    database.logAudit(clientId, 'REQUEST_CREATED', 'request', requestId.toString(), 'New request created', ipAddress);
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: true, requestId, message: 'Request created successfully' }));
                                }
                            });
                        }
                    );
                } else {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Only clients can create requests' }));
                }
            });
        });
    }

    else if (pathname === '/api/create-refund' && req.method === 'POST') {
        requireAuth(req, res, (userId) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const refundData = JSON.parse(body);
                const userIdStr = String(userId);

                if (userIdStr.startsWith('client_')) {
                    const clientId = parseInt(userIdStr.replace('client_', ''));

                    database.database.get(
                        'SELECT LEFT(order_num,3) AS store_id FROM "order" WHERE order_num = $1',
                        [refundData.order_num],
                        (err, result) => {
                            if (err || !result) {
                                res.writeHead(404, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Order not found' }));
                                return;
                            }

                            const storeId = result.store_id;
                            const now = new Date();
                            const month = (now.getMonth() + 1).toString().padStart(2, '0');
                            const year = now.getFullYear().toString().slice(-3);

                            database.database.get(
                                'SELECT COUNT(*)::int AS refund_count FROM refund WHERE SUBSTRING(refund_id::text FROM 4 FOR 2)::int = $2::int AND SUBSTRING(refund_id::text FROM 6 FOR 3)::int = ($1::int % 1000)',
                                [now.getFullYear().toString(), (now.getMonth() + 1).toString().padStart(2, '0')],
                                (err, result) => {
                                    if (err) {
                                        console.error('Error counting refunds:', err);
                                        res.writeHead(500, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: false, message: 'Error generating refund ID' }));
                                        return;
                                    }

                                    const refundCount = result ? result.refund_count + 1 : 1;
                                    const refundSeqPadded = refundCount.toString().padStart(2, '0');

                                    // Format refund ID: storeId + month (2 digits) + year (3 digits) + seq (2 digits)
                                    const refundId = storeId + month + year + refundSeqPadded;

                                    refundData.refund_id = refundId;

                                    database.createRefund(refundData, (err, refundId) => {
                                        if (err) {
                                            res.writeHead(500, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Error creating refund' }));
                                        } else {
                                            database.logAudit(clientId, 'REFUND_CREATED', 'refund', refundId.toString(), 'New refund requested', ipAddress);
                                            res.writeHead(200, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: true, refundId, message: 'Refund requested successfully' }));
                                        }
                                    });
                                }
                            );
                        }
                    );
                } else {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Only clients can request refunds' }));
                }
            });
        });
    }

    else if (pathname === '/api/add-product' && req.method === 'POST') {
        requireStoreOwner()(req, res, (personalId) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const productData = JSON.parse(body);

                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = $1',
                    [personalId],
                    (err, bossStore) => {
                        if (err || !bossStore) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Store not found for this owner' }));
                            return;
                        }

                        const storeId = productData.storeId || bossStore.store_id;

                        if (!storeId) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                            return;
                        }

                        database.database.get(
                            'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                            [personalId, storeId],
                            (err, ownsStore) => {
                                if (err || !ownsStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to add products to this store' }));
                                    return;
                                }

                                // PostgreSQL: extract the numeric product sequence from the store-prefixed product code
                                database.database.get(
                                    'SELECT MAX(CAST(SUBSTRING(code FROM 4) AS INTEGER)) AS max_product_num FROM product WHERE LEFT(code,3) = $1',
                                    [storeId],
                                    (err, result) => {
                                        if (err) {
                                            console.error('Error getting max product number:', err);
                                            res.writeHead(500, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Error generating product code' }));
                                            return;
                                        }

                                        const maxProductNum = result?.max_product_num || 0;
                                        let nextProductNum = maxProductNum + 1;

                                        // Ensure product number doesn't end with 0000
                                        while (nextProductNum % 10000 === 0) {
                                            nextProductNum++;
                                        }

                                        // Format product code: storeId + productNum (4 digits, padded)
                                        const productNumPadded = nextProductNum.toString().padStart(4, '0');
                                        productData.code = storeId + productNumPadded;
                                        productData.store_id = storeId;

                                        database.addProduct(personalId, productData, (err, productId) => {
                                            if (err) {
                                                console.error('Error adding product:', err);
                                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                                res.end(JSON.stringify({
                                                    success: false,
                                                    message: 'Error adding product: ' + (err.message || 'Unknown error'),
                                                    details: err.toString()
                                                }));
                                            } else {
                                                database.logAudit(personalId, 'PRODUCT_ADDED', 'product', productId.toString(), 'New product added', ipAddress);
                                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                                res.end(JSON.stringify({
                                                    success: true,
                                                    productId,
                                                    message: 'Product added successfully',
                                                    productCode: productData.code
                                                }));
                                            }
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    }

    else if (pathname === '/api/update-product' && req.method === 'POST') {
        requireStoreOwner()(req, res, (personalId) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const productData = JSON.parse(body);

                if (!productData.code) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Product code is required' }));
                    return;
                }

                database.database.get(
                    'SELECT LEFT(code,3) AS store_id FROM product WHERE code = $1',
                    [productData.code],
                    (err, product) => {
                        if (err || !product) {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Product not found' }));
                            return;
                        }

                        database.database.get(
                            'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                            [personalId, product.store_id],
                            (err, ownsStore) => {
                                if (err || !ownsStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to update products in this store' }));
                                    return;
                                }

                                database.updateProduct(personalId, productData, (err, changes) => {
                                    if (err) {
                                        console.error('Error updating product:', err);
                                        res.writeHead(500, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: false, message: 'Error updating product: ' + err.message }));
                                    } else if (changes === 0) {
                                        res.writeHead(404, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: false, message: 'Product not found or no changes made' }));
                                    } else {
                                        database.logAudit(personalId, 'PRODUCT_UPDATED', 'product', productData.code, 'Product updated', ipAddress);
                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: true, message: 'Product updated successfully' }));
                                    }
                                });
                            }
                        );
                    }
                );
            });
        });
    }

    else if (pathname === '/api/store-reports' && req.method === 'GET') {
        requireRole('store_owner')(req, res, (userId, user) => {
            database.getStoreReports(userId, (err, reports) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Error fetching reports' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, reports }));
                }
            });
        });
    }

    else if (pathname === '/api/all-users' && req.method === 'GET') {
        requireRole('admin')(req, res, (userId, user) => {
            database.getAllUsers((err, users) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Error fetching users' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, users }));
                }
            });
        });
    }

    else if (pathname === '/api/all-orders' && req.method === 'GET') {
        requireRole('admin')(req, res, (userId, user) => {
            database.getAllOrders((err, orders) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Error fetching orders' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, orders }));
                }
            });
        });
    }

    // Updated /api/force-change-password endpoint with redirect handling
    else if (pathname === '/api/force-change-password' && req.method === 'POST') {
        const cookies = parseCookies(req);
        const sessionId = cookies.sessionId;
        const userId = tempAdminSessions.get(sessionId);

        if (!userId) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Not authenticated or invalid session' }));
            return;
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const { newPassword, confirmPassword, redirectTo } = JSON.parse(body);

                if (!newPassword || !confirmPassword) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'All fields are required' }));
                    return;
                }

                if (newPassword !== confirmPassword) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'New passwords do not match' }));
                    return;
                }

                if (!validatePassword(newPassword)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        message: 'Password must have at least 8 characters, including uppercase, lowercase, number and special character'
                    }));
                    return;
                }

                // First, try to find the user in the users table (for admin)
                database.getUserById(userId, (err, user) => {
                    if (err) {
                        console.error('Error finding user by ID:', err);
                    }

                    if (user) {
                        // Found in users table (admin or regular user)
                        console.log('Found user in users table:', user);

                        const hashedPassword = bcrypt.hashSync(newPassword, 10);

                        database.database.run(
                            'UPDATE users SET password = $1, force_password_change = FALSE WHERE id = $2',
                            [hashedPassword, userId],
                            function(err) {
                                if (err) {
                                    console.error('Error updating password:', err);
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'Failed to update password' }));
                                    return;
                                }

                                // Also update password in personal table if it exists (for admin)
                                database.database.run(
                                    'UPDATE personal SET password = $1 WHERE id = $2',
                                    [hashedPassword, userId],
                                    function(err) {
                                        if (err) {
                                            console.log('No personal record to update for ID:', userId);
                                        }
                                    }
                                );

                                // Clear temp session
                                tempAdminSessions.delete(sessionId);

                                // Create new permanent session
                                const newSessionId = generateSessionId();

                                // Determine how to store the user ID based on user type
                                let sessionUserId = String(userId);

                                if (user.user_type === 'store_owner' || user.user_type === 'store_employee') {
                                    sessionUserId = `personal_${userId}`;
                                }

                                sessions.set(newSessionId, sessionUserId);

                                // Determine redirect based on user type or provided redirectTo
                                let finalRedirect = redirectTo || 'dashboard.html';

                                if (!redirectTo) {
                                    if (user.username === 'admin' || user.user_type === 'admin') {
                                        finalRedirect = 'admin.html';
                                    } else if (user.user_type === 'store_owner') {
                                        finalRedirect = 'store-owner.html';
                                    } else if (user.user_type === 'store_employee') {
                                        finalRedirect = 'store-employee.html';
                                    } else if (user.user_type === 'client') {
                                        finalRedirect = 'client-dashboard.html';
                                    }
                                }

                                console.log(`Password changed successfully for user ${userId}, redirecting to ${finalRedirect}`);

                                database.logAudit(userId, 'FORCED_PASSWORD_CHANGE', 'auth', userId.toString(),
                                    `${user.user_type || 'user'} forced password change completed`, ipAddress);

                                // Set the cookie with proper options
                                res.writeHead(200, {
                                    'Content-Type': 'application/json',
                                    'Set-Cookie': `sessionId=${newSessionId}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict` // Extended to 24 hours
                                });

                                res.end(JSON.stringify({
                                    success: true,
                                    message: 'Password changed successfully.',
                                    redirectTo: finalRedirect,
                                    userType: user.user_type || 'user'
                                }));
                            }
                        );
                    } else {
                        // Not found in users table, check personal table (for store owners/employees)
                        console.log('User not found in users table, checking personal table for ID:', userId);

                        database.getPersonalById(userId, (err, personal) => {
                            if (err) {
                                console.error('Error finding personal by ID:', err);
                            }

                            if (personal) {
                                console.log('Found user in personal table:', personal);

                                // Update password in personal table
                                const hashedPassword = bcrypt.hashSync(newPassword, 10);

                                database.database.run(
                                    'UPDATE personal SET password = $1 WHERE id = $2',
                                    [hashedPassword, userId],
                                    function(err) {
                                        if (err) {
                                            console.error('Error updating personal password:', err);
                                            res.writeHead(500, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Failed to update password' }));
                                            return;
                                        }

                                        // Also update in users table if exists
                                        database.database.run(
                                            'UPDATE users SET password = $1, force_password_change = FALSE WHERE email = $2',
                                            [hashedPassword, personal.email],
                                            function(err) {
                                                if (err) {
                                                    console.log('No users record to update for email:', personal.email);
                                                }
                                            }
                                        );

                                        // Determine user type (boss/owner or employee)
                                        database.database.get(
                                            'SELECT boss_id FROM boss WHERE boss_id = $1',
                                            [userId],
                                            (err, boss) => {
                                                let userType = 'store_employee';
                                                let finalRedirect = redirectTo || 'store-employee.html';

                                                if (boss) {
                                                    userType = 'store_owner';
                                                    finalRedirect = redirectTo || 'store-owner.html';
                                                }

                                                // Clear temp session
                                                tempAdminSessions.delete(sessionId);

                                                // Create new permanent session with personal_ prefix
                                                const newSessionId = generateSessionId();
                                                sessions.set(newSessionId, `personal_${userId}`);

                                                console.log(`Password changed successfully for ${userType} ${userId}, redirecting to ${finalRedirect}`);

                                                database.logAudit(userId, 'FORCED_PASSWORD_CHANGE', 'auth', userId.toString(),
                                                    `${userType} forced password change completed`, ipAddress);

                                                // Set the cookie with proper options - extended to 24 hours
                                                res.writeHead(200, {
                                                    'Content-Type': 'application/json',
                                                    'Set-Cookie': `sessionId=${newSessionId}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`
                                                });

                                                res.end(JSON.stringify({
                                                    success: true,
                                                    message: 'Password changed successfully.',
                                                    redirectTo: finalRedirect,
                                                    userType: userType
                                                }));
                                            }
                                        );
                                    }
                                );
                            } else {
                                // User not found in any table
                                console.error('User not found in any table with ID:', userId);
                                res.writeHead(404, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'User not found' }));
                            }
                        });
                    }
                });
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid request format' }));
            }
        });
    }

    else if (pathname === '/api/register-employee' && req.method === 'POST') {
        requireAuth(req, res, (userId) => {
            const userIdStr = String(userId);

            // Check if this is the admin user
            if (userIdStr === '000000') {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store owners can register employees' }));
                return;
            }

            if (!userIdStr.startsWith('personal_')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store owners can register employees' }));
                return;
            }

            const personalId = userIdStr.replace('personal_', '');

            database.database.get(
                'SELECT boss_id FROM boss WHERE boss_id = $1',
                [personalId],
                (err, boss) => {
                    if (err || !boss) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Only store owners can register employees' }));
                        return;
                    }

                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', () => {
                        const { firstName, lastName, ssn, email, password, storeId, dateOfHire } = JSON.parse(body);

                        if (!firstName || !lastName || !ssn || !email || !password || !storeId || !dateOfHire) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'All fields are required' }));
                            return;
                        }

                        if (!/^\d{13}$/.test(ssn)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'SSN must be exactly 13 digits' }));
                            return;
                        }

                        if (!validateEmail(email)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Invalid email format' }));
                            return;
                        }

                        if (!validatePassword(password)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: false,
                                message: 'Password must have at least 8 characters, including uppercase, lowercase, number and special character'
                            }));
                            return;
                        }

                        database.getPersonalByEmail(email, (err, existingPersonal) => {
                            if (err) {
                                console.error('Error checking personal:', err);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Server error checking personal' }));
                                return;
                            }

                            if (existingPersonal) {
                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Email is already registered' }));
                                return;
                            }

                            // Find the next available employee number for this store
                            database.database.all(
                                "SELECT id FROM personal WHERE id LIKE '" + storeId + "%' ORDER BY id",
                                [],
                                (err, existingEmployees) => {
                                    if (err) {
                                        console.error('Error getting employees:', err);
                                        res.writeHead(500, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: false, message: 'Server error generating employee ID' }));
                                        return;
                                    }

                                    // Find the first available employee number from 001 to 999
                                    let nextEmployeeNum = 1;
                                    const existingNumbers = (existingEmployees || [])
                                        .map(e => {
                                            const num = e.id.substring(3);
                                            return parseInt(num, 10);
                                        })
                                        .filter(num => !isNaN(num));

                                    existingNumbers.sort((a, b) => a - b);

                                    // Find the first gap in the sequence
                                    for (let i = 1; i <= 999; i++) {
                                        if (!existingNumbers.includes(i)) {
                                            nextEmployeeNum = i;
                                            break;
                                        }
                                    }

                                    if (nextEmployeeNum > 999) {
                                        res.writeHead(400, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ success: false, message: 'Maximum employees reached for this store' }));
                                        return;
                                    }

                                    const employeeNumPadded = nextEmployeeNum.toString().padStart(3, '0');
                                    const newPersonalId = storeId + employeeNumPadded;

                                    database.database.run('BEGIN TRANSACTION', (err) => {
                                        if (err) {
                                            console.error('Error beginning transaction:', err);
                                            res.writeHead(500, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Server error during registration' }));
                                            return;
                                        }

                                        database.database.run(
                                            'INSERT INTO personal (id, first_name, last_name, ssn, email, password) VALUES ($1, $2, $3, $4, $5, $6)',
                                            [
                                                newPersonalId,
                                                firstName,
                                                lastName,
                                                ssn,
                                                email,
                                                bcrypt.hashSync(password, 10)
                                            ],
                                            function(err) {
                                                if (err) {
                                                    database.database.run('ROLLBACK');
                                                    console.error('Error inserting personal:', err);

                                                    if (err.code === '23505') {
                                                        res.writeHead(400, { 'Content-Type': 'application/json' });
                                                        res.end(JSON.stringify({
                                                            success: false,
                                                            message: 'This personal ID is already taken. Please try again.'
                                                        }));
                                                    } else {
                                                        res.writeHead(400, { 'Content-Type': 'application/json' });
                                                        res.end(JSON.stringify({ success: false, message: 'Error registering employee' }));
                                                    }
                                                    return;
                                                }

                                                database.database.run(
                                                    'INSERT INTO employees (employee_id, date_of_hire) VALUES ($1, $2)',
                                                    [newPersonalId, dateOfHire],
                                                    (err) => {
                                                        if (err) {
                                                            database.database.run('ROLLBACK');
                                                            console.error('Error inserting employee:', err);
                                                            res.writeHead(400, { 'Content-Type': 'application/json' });
                                                            res.end(JSON.stringify({ success: false, message: 'Error registering as employee' }));
                                                            return;
                                                        }

                                                        database.database.run(
                                                            'INSERT INTO works_in_store (personal_id, store_id) VALUES ($1, $2)',
                                                            [newPersonalId, storeId],
                                                            (err) => {
                                                                if (err) {
                                                                    database.database.run('ROLLBACK');
                                                                    console.error('Error inserting works_in_store:', err);
                                                                    res.writeHead(400, { 'Content-Type': 'application/json' });
                                                                    res.end(JSON.stringify({ success: false, message: 'Error assigning employee to store' }));
                                                                    return;
                                                                }

                                                                database.database.run(
                                                                    'INSERT INTO permissions (personal_id, type, authorisation) VALUES ($1, $2, $3)',
                                                                    [newPersonalId, 'EMPLOYEE', 'limited_access'],
                                                                    (err) => {
                                                                        if (err) {
                                                                            console.error('Error inserting permissions:', err);
                                                                        }

                                                                        // Also create entry in users table for login with force_password_change = 1
                                                                        database.database.run(
                                                                            'INSERT INTO users (id, username, email, password, user_type, force_password_change) VALUES ($1, $2, $3, $4, $5, $6)',
                                                                            [
                                                                                newPersonalId,
                                                                                `${firstName} ${lastName}`,
                                                                                email,
                                                                                bcrypt.hashSync(password, 10),
                                                                                'store_employee',
                                                                                1
                                                                            ],
                                                                            (err) => {
                                                                                if (err) {
                                                                                    console.error('Error creating user entry for employee:', err);
                                                                                }

                                                                                database.database.run('COMMIT', (err) => {
                                                                                    if (err) {
                                                                                        database.database.run('ROLLBACK');
                                                                                        console.error('Error committing transaction:', err);
                                                                                        res.writeHead(500, { 'Content-Type': 'application/json' });
                                                                                        res.end(JSON.stringify({ success: false, message: 'Error completing registration' }));
                                                                                        return;
                                                                                    }

                                                                                    database.logAudit(personalId, 'EMPLOYEE_REGISTERED', 'employee', newPersonalId, `Employee registered: ${firstName} ${lastName}`, ipAddress);

                                                                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                                    res.end(JSON.stringify({
                                                                                        success: true,
                                                                                        message: 'Employee registered successfully!',
                                                                                        employeeId: newPersonalId,
                                                                                        name: `${firstName} ${lastName}`
                                                                                    }));
                                                                                });
                                                                            }
                                                                        );
                                                                    }
                                                                );
                                                            }
                                                        );
                                                    }
                                                );
                                            }
                                        );
                                    });
                                }
                            );
                        });
                    });
                }
            );
        });
    }

    else if (pathname === '/api/delete-employee' && req.method === 'POST') {
        requireAuth(req, res, (userId) => {
            const userIdStr = String(userId);

            // Check if this is the admin user
            if (userIdStr === '000000') {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store owners can delete employees' }));
                return;
            }

            if (!userIdStr.startsWith('personal_')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store owners can delete employees' }));
                return;
            }

            const personalId = userIdStr.replace('personal_', '');

            database.database.get(
                'SELECT boss_id FROM boss WHERE boss_id = $1',
                [personalId],
                (err, boss) => {
                    if (err || !boss) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Only store owners can delete employees' }));
                        return;
                    }

                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', () => {
                        const { employeeId, storeId } = JSON.parse(body);

                        if (!employeeId || !storeId) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Employee ID and Store ID are required' }));
                            return;
                        }

                        database.database.get(
                            'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                            [personalId, storeId],
                            (err, bossStore) => {
                                if (err || !bossStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to manage employees in this store' }));
                                    return;
                                }

                                database.database.get(
                                    'SELECT personal_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                                    [employeeId, storeId],
                                    (err, employeeStore) => {
                                        if (err || !employeeStore) {
                                            res.writeHead(404, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Employee not found in this store' }));
                                            return;
                                        }

                                        database.database.get(
                                            'SELECT boss_id FROM boss WHERE boss_id = $1',
                                            [employeeId],
                                            (err, isBoss) => {
                                                if (err) {
                                                    console.error('Error checking if employee is boss:', err);
                                                }

                                                if (isBoss) {
                                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                                    res.end(JSON.stringify({ success: false, message: 'Cannot delete store owners' }));
                                                    return;
                                                }

                                                database.database.run('BEGIN TRANSACTION', (err) => {
                                                    if (err) {
                                                        console.error('Error beginning transaction:', err);
                                                        res.writeHead(500, { 'Content-Type': 'application/json' });
                                                        res.end(JSON.stringify({ success: false, message: 'Server error during deletion' }));
                                                        return;
                                                    }

                                                    database.database.run(
                                                        'DELETE FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                                                        [employeeId, storeId],
                                                        (err) => {
                                                            if (err) {
                                                                database.database.run('ROLLBACK');
                                                                console.error('Error deleting from works_in_store:', err);
                                                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                                                res.end(JSON.stringify({ success: false, message: 'Error removing employee from store' }));
                                                                return;
                                                            }

                                                            database.database.run(
                                                                'DELETE FROM employees WHERE employee_id = $1',
                                                                [employeeId],
                                                                (err) => {
                                                                    if (err) {
                                                                        console.error('Error deleting from employees:', err);
                                                                    }

                                                                    database.database.run(
                                                                        'DELETE FROM permissions WHERE personal_id = $1',
                                                                        [employeeId],
                                                                        (err) => {
                                                                            if (err) {
                                                                                console.error('Error deleting from permissions:', err);
                                                                            }

                                                                            database.database.run(
                                                                                'DELETE FROM personal WHERE id = $1',
                                                                                [employeeId],
                                                                                (err) => {
                                                                                    if (err) {
                                                                                        console.error('Error deleting from personal:', err);
                                                                                    }

                                                                                    // Also delete from users table
                                                                                    database.database.run(
                                                                                        'DELETE FROM users WHERE id = $1',
                                                                                        [employeeId],
                                                                                        (err) => {
                                                                                            if (err) {
                                                                                                console.error('Error deleting from users:', err);
                                                                                            }

                                                                                            database.database.run('COMMIT', (commitErr) => {
                                                                                                if (commitErr) {
                                                                                                    database.database.run('ROLLBACK');
                                                                                                    console.error('Error committing transaction:', commitErr);
                                                                                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                                                                                    res.end(JSON.stringify({ success: false, message: 'Error completing deletion' }));
                                                                                                    return;
                                                                                                }

                                                                                                database.logAudit(personalId, 'EMPLOYEE_DELETED', 'employee', employeeId, `Employee deleted from store ${storeId}`, ipAddress);

                                                                                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                                                                                res.end(JSON.stringify({
                                                                                                    success: true,
                                                                                                    message: 'Employee deleted successfully'
                                                                                                }));
                                                                                            });
                                                                                        }
                                                                                    );
                                                                                }
                                                                            );
                                                                        }
                                                                    );
                                                                }
                                                            );
                                                        }
                                                    );
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    }

    else if (pathname === '/api/update-employee-status' && req.method === 'POST') {
        requireAuth(req, res, (userId) => {
            const userIdStr = String(userId);

            // Check if this is the admin user
            if (userIdStr === '000000') {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store owners can update employee status' }));
                return;
            }

            if (!userIdStr.startsWith('personal_')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store owners can update employee status' }));
                return;
            }

            const personalId = userIdStr.replace('personal_', '');

            database.database.get(
                'SELECT boss_id FROM boss WHERE boss_id = $1',
                [personalId],
                (err, boss) => {
                    if (err || !boss) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Only store owners can update employee status' }));
                        return;
                    }

                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', () => {
                        const { employeeId, storeId, status } = JSON.parse(body);

                        if (!employeeId || !storeId || !status) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Employee ID, Store ID and Status are required' }));
                            return;
                        }

                        database.database.get(
                            'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                            [personalId, storeId],
                            (err, bossStore) => {
                                if (err || !bossStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to manage employees in this store' }));
                                    return;
                                }

                                database.database.get(
                                    'SELECT personal_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                                    [employeeId, storeId],
                                    (err, employeeStore) => {
                                        if (err || !employeeStore) {
                                            res.writeHead(404, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Employee not found in this store' }));
                                            return;
                                        }

                                        let permissionType = 'EMPLOYEE';
                                        let authorization = 'limited_access';

                                        if (status === 'promoted') {
                                            permissionType = 'MANAGER';
                                            authorization = 'extended_access';
                                        } else if (status === 'suspended') {
                                            permissionType = 'SUSPENDED';
                                            authorization = 'no_access';
                                        } else if (status === 'active') {
                                            permissionType = 'EMPLOYEE';
                                            authorization = 'limited_access';
                                        }

                                        database.database.run(
                                            'UPDATE permissions SET type = $1, authorisation = $2 WHERE personal_id = $3',
                                            [permissionType, authorization, employeeId],
                                            function(err) {
                                                if (err) {
                                                    console.error('Error updating employee status:', err);
                                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                                    res.end(JSON.stringify({ success: false, message: 'Error updating employee status' }));
                                                    return;
                                                }

                                                database.logAudit(personalId, 'EMPLOYEE_STATUS_UPDATED', 'employee', employeeId, `Employee status updated to: ${status}`, ipAddress);

                                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                                res.end(JSON.stringify({
                                                    success: true,
                                                    message: `Employee status updated to ${status} successfully`
                                                }));
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    }

    else if (pathname === '/api/update-employee' && req.method === 'POST') {
        requireAuth(req, res, (userId) => {
            const userIdStr = String(userId);

            // Check if this is the admin user
            if (userIdStr === '000000') {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store owners can update employees' }));
                return;
            }

            if (!userIdStr.startsWith('personal_')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store owners can update employees' }));
                return;
            }

            const personalId = userIdStr.replace('personal_', '');

            database.database.get(
                'SELECT boss_id FROM boss WHERE boss_id = $1',
                [personalId],
                (err, boss) => {
                    if (err || !boss) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'Only store owners can update employees' }));
                        return;
                    }

                    let body = '';
                    req.on('data', chunk => {
                        body += chunk.toString();
                    });
                    req.on('end', () => {
                        const { employeeId, storeId, firstName, lastName, email } = JSON.parse(body);

                        if (!employeeId || !storeId) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Employee ID and Store ID are required' }));
                            return;
                        }

                        database.database.get(
                            'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                            [personalId, storeId],
                            (err, bossStore) => {
                                if (err || !bossStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to manage employees in this store' }));
                                    return;
                                }

                                database.database.get(
                                    'SELECT personal_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                                    [employeeId, storeId],
                                    (err, employeeStore) => {
                                        if (err || !employeeStore) {
                                            res.writeHead(404, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Employee not found in this store' }));
                                            return;
                                        }

                                        const updates = [];
                                        const params = [];

                                        if (firstName) {
                                            updates.push(`first_name = $${params.length + 1}`);
                                            params.push(firstName);
                                        }

                                        if (lastName) {
                                            updates.push(`last_name = $${params.length + 1}`);
                                            params.push(lastName);
                                        }

                                        if (email) {
                                            if (!validateEmail(email)) {
                                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                                res.end(JSON.stringify({ success: false, message: 'Invalid email format' }));
                                                return;
                                            }
                                            updates.push(`email = $${params.length + 1}`);
                                            params.push(email);
                                        }

                                        if (updates.length === 0) {
                                            res.writeHead(400, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'No fields to update' }));
                                            return;
                                        }

                                        params.push(employeeId);

                                        database.database.run(
                                            `UPDATE personal SET ${updates.join(', ')} WHERE id = $${params.length}`,
                                            params,
                                            function(err) {
                                                if (err) {
                                                    console.error('Error updating employee:', err);
                                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                                    res.end(JSON.stringify({ success: false, message: 'Error updating employee information' }));
                                                    return;
                                                }

                                                // Also update in users table if email was changed
                                                if (email) {
                                                    database.database.run(
                                                        'UPDATE users SET email = $1 WHERE id = $2',
                                                        [email, employeeId],
                                                        (err) => {
                                                            if (err) {
                                                                console.error('Error updating user email:', err);
                                                            }
                                                        }
                                                    );
                                                }

                                                if (firstName || lastName) {
                                                    database.database.get(
                                                        'SELECT first_name, last_name FROM personal WHERE id = $1',
                                                        [employeeId],
                                                        (err, personal) => {
                                                            if (!err && personal) {
                                                                const newUsername = `${personal.first_name} ${personal.last_name}`;
                                                                database.database.run(
                                                                    'UPDATE users SET username = $1 WHERE id = $2',
                                                                    [newUsername, employeeId],
                                                                    (err) => {
                                                                        if (err) {
                                                                            console.error('Error updating user username:', err);
                                                                        }
                                                                    }
                                                                );
                                                            }
                                                        }
                                                    );
                                                }

                                                database.logAudit(personalId, 'EMPLOYEE_UPDATED', 'employee', employeeId, `Employee information updated`, ipAddress);

                                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                                res.end(JSON.stringify({
                                                    success: true,
                                                    message: 'Employee information updated successfully'
                                                }));
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
    }

    else if (pathname === '/api/store-products' && req.method === 'GET') {
        requireStoreOwner()(req, res, (personalId) => {
            const storeId = parsedUrl.query.storeId;

            if (!storeId) {
                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = $1 LIMIT 1',
                    [personalId],
                    (err, store) => {
                        if (err || !store) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                            return;
                        }

                        database.getStoreProducts(store.store_id, (err, products) => {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error fetching store products' }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, products }));
                            }
                        });
                    }
                );

                return;
            }

            database.database.get(
                'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                [personalId, storeId],
                (err, ownsStore) => {
                    if (err || !ownsStore) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'You are not authorized to view products in this store' }));
                        return;
                    }

                    database.getStoreProducts(storeId, (err, products) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Error fetching store products' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, products }));
                        }
                    });
                }
            );
        });
    }

    else if (pathname === '/api/store-orders' && req.method === 'GET') {
        requireStoreOwner()(req, res, (personalId) => {
            const storeId = parsedUrl.query.storeId;

            if (!storeId) {
                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = $1 LIMIT 1',
                    [personalId],
                    (err, store) => {
                        if (err || !store) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                            return;
                        }

                        database.getStoreOrders(store.store_id, (err, orders) => {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error fetching store orders' }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, orders }));
                            }
                        });
                    }
                );

                return;
            }

            database.database.get(
                'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                [personalId, storeId],
                (err, ownsStore) => {
                    if (err || !ownsStore) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'You are not authorized to view orders in this store' }));
                        return;
                    }

                    database.getStoreOrders(storeId, (err, orders) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Error fetching store orders' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, orders }));
                        }
                    });
                }
            );
        });
    }

    else if (pathname === '/api/store-employees' && req.method === 'GET') {
        requireStoreOwner()(req, res, (personalId) => {
            const storeId = parsedUrl.query.storeId;

            if (!storeId) {
                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = $1 LIMIT 1',
                    [personalId],
                    (err, store) => {
                        if (err || !store) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                            return;
                        }

                        database.getStoreEmployees(store.store_id, (err, employees) => {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error fetching store employees' }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, employees }));
                            }
                        });
                    }
                );

                return;
            }

            database.database.get(
                'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                [personalId, storeId],
                (err, ownsStore) => {
                    if (err || !ownsStore) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'You are not authorized to view employees in this store' }));
                        return;
                    }

                    database.getStoreEmployees(storeId, (err, employees) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Error fetching store employees' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, employees }));
                        }
                    });
                }
            );
        });
    }

    else if (pathname === '/api/store-reports' && req.method === 'GET') {
        requireStoreOwner()(req, res, (personalId) => {
            const storeId = parsedUrl.query.storeId;

            if (!storeId) {
                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = $1 LIMIT 1',
                    [personalId],
                    (err, store) => {
                        if (err || !store) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                            return;
                        }

                        database.getStoreReports(store.store_id, (err, reports) => {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error fetching store reports' }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, reports }));
                            }
                        });
                    }
                );

                return;
            }

            database.database.get(
                'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                [personalId, storeId],
                (err, ownsStore) => {
                    if (err || !ownsStore) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'You are not authorized to view reports in this store' }));
                        return;
                    }

                    database.getStoreReports(storeId, (err, reports) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Error fetching store reports' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, reports }));
                        }
                    });
                }
            );
        });
    }

    else if (pathname === '/api/store-stats' && req.method === 'GET') {
        requireStoreOwner()(req, res, (personalId) => {
            const storeId = parsedUrl.query.storeId;

            if (!storeId) {
                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = $1 LIMIT 1',
                    [personalId],
                    (err, store) => {
                        if (err || !store) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                            return;
                        }

                        database.getStoreStats(store.store_id, (err, stats) => {
                            if (err) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error fetching store statistics' }));
                            } else {
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, stats }));
                            }
                        });
                    }
                );

                return;
            }

            database.database.get(
                'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                [personalId, storeId],
                (err, ownsStore) => {
                    if (err || !ownsStore) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: 'You are not authorized to view statistics in this store' }));
                        return;
                    }

                    database.getStoreStats(storeId, (err, stats) => {
                        if (err) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Error fetching store statistics' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, stats }));
                        }
                    });
                }
            );
        });
    }

    else if (pathname === '/api/advanced-reports' && req.method === 'GET') {
        requireRole('admin')(req, res, () => {
            const reportName = parsedUrl.query.report;

            if (!reportName) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: 'The report query parameter is required'
                }));
                return;
            }

            let params = [];

            if (reportName === 'get_low_stock_high_demand_products') {
                const stockThreshold = Number(parsedUrl.query.stockThreshold ?? 5);
                const demandThreshold = Number(parsedUrl.query.demandThreshold ?? 5);

                if (!Number.isInteger(stockThreshold) || !Number.isInteger(demandThreshold)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        message: 'stockThreshold and demandThreshold must be integers'
                    }));
                    return;
                }

                params = [stockThreshold, demandThreshold];
            }

            database.runReport(reportName, params, (err, rows) => {
                if (err) {
                    console.error('Error executing report:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        message: 'Error executing report: ' + err.message
                    }));
                    return;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    report: reportName,
                    rows
                }));
            });
        });
    }

    else if (pathname === '/api/employee-tasks' && req.method === 'GET') {
        requireAuth(req, res, (userId) => {
            const userIdStr = String(userId);

            // Check if this is the admin user
            if (userIdStr === '000000') {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store employees can access this endpoint' }));
                return;
            }

            if (!userIdStr.startsWith('personal_')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only store employees can access this endpoint' }));
                return;
            }

            const personalId = userIdStr.replace('personal_', '');
            const storeId = parsedUrl.query.storeId;

            if (!storeId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Store ID is required' }));
                return;
            }

            database.getEmployeeTasks(personalId, storeId, (err, tasks) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Error fetching employee tasks' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, tasks }));
                }
            });
        });
    }

    else if (pathname === '/api/client-stats' && req.method === 'GET') {
        requireAuth(req, res, (userId) => {
            const userIdStr = String(userId);

            if (!userIdStr.startsWith('client_')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Only clients can access this endpoint' }));
                return;
            }

            const clientId = parseInt(userIdStr.replace('client_', ''));

            database.getClientStats(clientId, (err, stats) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Error fetching client statistics' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, stats }));
                }
            });
        });
    }

    else if (pathname === '/api/delete-product' && req.method === 'POST') {
        requireStoreOwner()(req, res, (personalId) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                const { productCode, storeId } = JSON.parse(body);

                if (!productCode || !storeId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Product code and store ID are required' }));
                    return;
                }

                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                    [personalId, storeId],
                    (err, ownsStore) => {
                        if (err || !ownsStore) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'You are not authorized to delete products from this store' }));
                            return;
                        }

                        database.deleteProduct(productCode, storeId, personalId, (err) => {
                            if (err) {
                                console.error('Error deleting product:', err);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: false, message: 'Error deleting product: ' + err.message }));
                            } else {
                                database.logAudit(personalId, 'PRODUCT_DELETED', 'product', productCode, 'Product deleted', ipAddress);
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ success: true, message: 'Product deleted successfully' }));
                            }
                        });
                    }
                );
            });
        });
    }

    else if (pathname === '/api/product-by-code' && req.method === 'GET') {
        requireAuth(req, res, (userId) => {
            const parsedUrl = url.parse(req.url, true);
            const productCode = parsedUrl.query.code;

            if (!productCode) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Product code is required' }));
                return;
            }

            database.getProductByCode(productCode, (err, product) => {
                if (err) {
                    console.error('Error fetching product:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Error fetching product' }));
                } else if (!product) {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Product not found' }));
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, product }));
                }
            });
        });
    }

    else if (pathname === '/api/generate-report' && req.method === 'POST') {
        requireStoreOwner()(req, res, (personalId) => {
            let body = '';

            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', () => {
                let data;

                try {
                    data = JSON.parse(body);
                } catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        message: 'Invalid JSON request body'
                    }));
                    return;
                }

                const {
                    storeId,
                    period,
                    startDate,
                    endDate,
                    type,
                    ownerSignature
                } = data;

                if (!storeId || !period || !startDate || !endDate || !type) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        message: 'All fields are required'
                    }));
                    return;
                }

                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = $1 AND store_id = $2',
                    [personalId, storeId],
                    (err, ownsStore) => {
                        if (err || !ownsStore) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: false,
                                message: 'You are not authorized to generate reports for this store'
                            }));
                            return;
                        }

                        database.generateStoreReport(
                            storeId,
                            startDate,
                            endDate,
                            type,
                            period,
                            ownerSignature,
                            (reportErr, report) => {
                                if (reportErr) {
                                    console.error('Error generating report:', reportErr);
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({
                                        success: false,
                                        message: 'Error generating report: ' + reportErr.message
                                    }));
                                    return;
                                }

                                const reportId =
                                    'RPT' +
                                    new Date(report.date).getTime().toString().slice(-6);

                                database.logAudit(
                                    personalId,
                                    'REPORT_GENERATED',
                                    'report',
                                    reportId,
                                    `Report generated: ${type} for ${period}`,
                                    ipAddress
                                );

                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    success: true,
                                    message: 'Report generated successfully',
                                    reportId,
                                    report: {
                                        id: reportId,
                                        storeId: report.store_id,
                                        period,
                                        startDate,
                                        endDate,
                                        type,
                                        generatedBy: personalId,
                                        generatedAt: report.date,
                                        overallProfit: report.overall_profit,
                                        salesTrend: report.sales_trend,
                                        marketingGrowth: report.marketing_growth,
                                        ownerSignature: report.owner_signature
                                    }
                                }));
                            }
                        );
                    }
                );
            });
        });
    }

    else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Page not found');
    }
});

server.listen(port, () => {
    console.log(`🎨 Handcraft Marketplace running at http://localhost:${port}`);
    console.log('👥 Roles: Admin, Store Owner, Store Employee, Registered Client, Unregistered Guest');
    console.log('🎯 Features: Product browsing, ordering, reviews, store management');
    console.log('🏪 Store Registration: Available at /register-store.html');
    console.log('👤 Client Registration: Available at /register.html');
});