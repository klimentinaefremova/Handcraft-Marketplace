const http = require('http');
const url = require('url');
const database = require('./database.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
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
        port: parseInt(process.env.SMTP_PORT) || 587,
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
        code += crypto.randomInt(0, 9);
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
                    'SELECT boss_id FROM boss WHERE boss_id = ?',
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

// Database initialization function
async function initializeDatabase() {
    console.log('🔍 Checking database schema...');

    // List of all required tables
    const requiredTables = [
        'client',
        'store',
        'category',
        'users',
        'personal',
        'product',
        'boss',
        'employees',
        'works_in_store',
        'permissions',
        'order',
        'order_items',
        'review',
        'request',
        'refund',
        'report',
        'audit_log',
        'color',
        'image',
        'delivery_address',
        'roles',
        'user_roles'
    ];

    try {
        // For SQLite, we need to use a different approach to check tables
        const result = await new Promise((resolve, reject) => {
            database.database.all(
                "SELECT name FROM sqlite_master WHERE type='table'",
                [],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        const existingTables = result.map(row => row.name);
        const missingTables = requiredTables.filter(table => !existingTables.includes(table));

        if (missingTables.length > 0) {
            console.log(`⚠️ Missing tables: ${missingTables.join(', ')}`);
            console.log('🔄 Recreating entire database...');

            // Drop all tables in correct order (respecting foreign keys)
            await dropAllTables();

            // Create all tables
            await createAllTables();

            // Create indexes
            await createIndexes();

            // Insert initial data
            await insertInitialData();

            console.log('✅ Database recreation completed');
        } else {
            console.log('✅ All required tables exist');
            // Even if tables exist, ensure admin user exists with ID 000000
            await ensureAdminUser();
        }
    } catch (err) {
        console.error('❌ Error checking database schema:', err);
        console.log('⚠️ Attempting to recreate database anyway...');

        try {
            await dropAllTables();
            await createAllTables();
            await createIndexes();
            await insertInitialData();
            console.log('✅ Database recreation completed');
        } catch (createErr) {
            console.error('❌ Failed to recreate database:', createErr);
        }
    }
}

// Function to ensure admin user exists with ID 000000
function ensureAdminUser() {
    return new Promise((resolve) => {
        database.database.get(
            'SELECT * FROM users WHERE id = ? OR username = ? OR email = ?',
            ['000000', 'admin', 'admin@handcraft.com'],
            (err, existingAdmin) => {
                if (err) {
                    console.error('Error checking for existing admin:', err.message);
                    resolve();
                    return;
                }

                // Insert admin user if it doesn't exist
                if (!existingAdmin) {
                    const adminId = '000000';
                    const adminPassword = bcrypt.hashSync('Admin123!', 10);

                    // Start a transaction
                    database.database.run('BEGIN TRANSACTION', (err) => {
                        if (err) {
                            console.error('Error beginning transaction:', err);
                            resolve();
                            return;
                        }

                        // Insert into users table
                        database.database.run(
                            `INSERT INTO users (id, username, email, password, user_type, force_password_change)
                             VALUES (?, ?, ?, ?, ?, ?)`,
                            [adminId, 'admin', 'admin@handcraft.com', adminPassword, 'admin', 1],
                            function(err) {
                                if (err) {
                                    database.database.run('ROLLBACK');
                                    console.error('Error inserting admin user:', err.message);
                                    resolve();
                                    return;
                                }

                                // Insert into personal table (required for boss table)
                                database.database.run(
                                    `INSERT INTO personal (id, first_name, last_name, ssn, email, password)
                                     VALUES (?, ?, ?, ?, ?, ?)`,
                                    [adminId, 'Admin', 'User', '0000000000000', 'admin@handcraft.com', adminPassword],
                                    function(err) {
                                        if (err) {
                                            database.database.run('ROLLBACK');
                                            console.error('Error inserting admin personal:', err.message);
                                            resolve();
                                            return;
                                        }

                                        // Insert into boss table (store owner)
                                        database.database.run(
                                            `INSERT INTO boss (boss_id, signature)
                                             VALUES (?, ?)`,
                                            [adminId, 'Admin Signature'],
                                            function(err) {
                                                if (err) {
                                                    database.database.run('ROLLBACK');
                                                    console.error('Error inserting admin boss:', err.message);
                                                    resolve();
                                                    return;
                                                }

                                                // Insert into permissions
                                                database.database.run(
                                                    `INSERT INTO permissions (personal_id, type, authorisation)
                                                     VALUES (?, ?, ?)`,
                                                    [adminId, 'ADMIN', 'full_access'],
                                                    function(err) {
                                                        if (err) {
                                                            console.error('Error inserting admin permissions:', err.message);
                                                            // Continue even if this fails
                                                        }

                                                        // Assign admin role
                                                        database.database.get(
                                                            'SELECT role_id FROM roles WHERE name = ?',
                                                            ['admin'],
                                                            (err, adminRole) => {
                                                                if (!err && adminRole) {
                                                                    database.database.run(
                                                                        'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
                                                                        [adminId, adminRole.role_id],
                                                                        (err) => {
                                                                            if (err) {
                                                                                console.error('Error assigning admin role:', err.message);
                                                                            }
                                                                        }
                                                                    );
                                                                }

                                                                database.database.run('COMMIT', (commitErr) => {
                                                                    if (commitErr) {
                                                                        console.error('Error committing transaction:', commitErr);
                                                                        database.database.run('ROLLBACK');
                                                                    } else {
                                                                        console.log('\n');
                                                                        console.log('🔐 ===== ADMIN CREDENTIALS =====');
                                                                        console.log('🆔 ID: 000000');
                                                                        console.log('👤 Username: admin');
                                                                        console.log('📧 Email: admin@handcraft.com');
                                                                        console.log('🔑 Password: Admin123!');
                                                                        console.log('⚠️ This is a first-time login. You will be required to change your password after 2FA verification.');
                                                                        console.log('================================\n');
                                                                    }
                                                                    resolve();
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
                } else {
                    console.log('✅ Admin user already exists with ID:', existingAdmin.id);
                    resolve();
                }
            }
        );
    });
}

function dropAllTables() {
    return new Promise((resolve, reject) => {
        console.log('🗑️ Dropping all tables...');

        // Drop in reverse order of creation (respect foreign keys)
        const dropQueries = [
            'DROP TABLE IF EXISTS user_roles',
            'DROP TABLE IF EXISTS roles',
            'DROP TABLE IF EXISTS delivery_address',
            'DROP TABLE IF EXISTS image',
            'DROP TABLE IF EXISTS color',
            'DROP TABLE IF EXISTS audit_log',
            'DROP TABLE IF EXISTS report',
            'DROP TABLE IF EXISTS refund',
            'DROP TABLE IF EXISTS request',
            'DROP TABLE IF EXISTS review',
            'DROP TABLE IF EXISTS order_items',
            'DROP TABLE IF EXISTS "order"',
            'DROP TABLE IF EXISTS permissions',
            'DROP TABLE IF EXISTS works_in_store',
            'DROP TABLE IF EXISTS employees',
            'DROP TABLE IF EXISTS boss',
            'DROP TABLE IF EXISTS product',
            'DROP TABLE IF EXISTS personal',
            'DROP TABLE IF EXISTS users',
            'DROP TABLE IF EXISTS category',
            'DROP TABLE IF EXISTS store',
            'DROP TABLE IF EXISTS client'
        ];

        let index = 0;

        function runNext() {
            if (index >= dropQueries.length) {
                console.log('✅ All tables dropped');
                resolve();
                return;
            }

            database.database.run(dropQueries[index], [], (err) => {
                if (err) {
                    console.error(`Error dropping table: ${err.message}`);
                    // Continue anyway
                }
                index++;
                runNext();
            });
        }

        runNext();
    });
}

function createAllTables() {
    return new Promise((resolve, reject) => {
        console.log('🏗️ Creating tables...');

        const createQueries = [
            // Client table (SERIAL ID starting from 1000)
            `CREATE TABLE IF NOT EXISTS client (
                client_id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Store table (VARCHAR ID)
            `CREATE TABLE IF NOT EXISTS store (
                store_id VARCHAR(10) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                date_of_founding DATE NOT NULL,
                physical_address TEXT NOT NULL,
                store_email VARCHAR(255) UNIQUE NOT NULL,
                rating DECIMAL(3,2) DEFAULT 0.0
            )`,

            // Category table (SERIAL ID starting from 1)
            `CREATE TABLE IF NOT EXISTS category (
                category_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                parent_category_id INTEGER REFERENCES category(category_id) ON DELETE SET NULL
            )`,

            // Users table (VARCHAR ID)
            `CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                user_type VARCHAR(50) NOT NULL,
                force_password_change INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Personal table (VARCHAR ID - format: storeId(3) + '001' for owner, storeId(3) + employeeNum(3) for employees)
            `CREATE TABLE IF NOT EXISTS personal (
                id VARCHAR(10) PRIMARY KEY,
                first_name VARCHAR(100) NOT NULL,
                last_name VARCHAR(100) NOT NULL,
                ssn VARCHAR(13) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Product table (VARCHAR ID)
            `CREATE TABLE IF NOT EXISTS product (
                id VARCHAR(50) PRIMARY KEY,
                code VARCHAR(20) UNIQUE NOT NULL,
                description TEXT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                availability INTEGER NOT NULL DEFAULT 0,
                weight DECIMAL(10,2),
                dimensions VARCHAR(50),
                production_time INTEGER,
                category_id INTEGER REFERENCES category(category_id) ON DELETE SET NULL,
                store_id VARCHAR(10) REFERENCES store(store_id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Boss table (VARCHAR ID - references personal.id)
            `CREATE TABLE IF NOT EXISTS boss (
                boss_id VARCHAR(10) PRIMARY KEY REFERENCES personal(id) ON DELETE CASCADE,
                signature TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Employees table (VARCHAR ID - references personal.id)
            `CREATE TABLE IF NOT EXISTS employees (
                employee_id VARCHAR(10) PRIMARY KEY REFERENCES personal(id) ON DELETE CASCADE,
                date_of_hire DATE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Works_in_store table (junction)
            `CREATE TABLE IF NOT EXISTS works_in_store (
                personal_id VARCHAR(10) REFERENCES personal(id) ON DELETE CASCADE,
                store_id VARCHAR(10) REFERENCES store(store_id) ON DELETE CASCADE,
                PRIMARY KEY (personal_id, store_id)
            )`,

            // Permissions table
            `CREATE TABLE IF NOT EXISTS permissions (
                permission_id INTEGER PRIMARY KEY AUTOINCREMENT,
                personal_id VARCHAR(10) REFERENCES personal(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                authorisation TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Order table (VARCHAR ID)
            `CREATE TABLE IF NOT EXISTS "order" (
                order_num VARCHAR(20) PRIMARY KEY,
                client_id INTEGER REFERENCES client(client_id) ON DELETE SET NULL,
                order_date TIMESTAMP NOT NULL,
                quantity INTEGER NOT NULL,
                payment_method VARCHAR(50) NOT NULL,
                discount DECIMAL(10,2) DEFAULT 0,
                delivery_address TEXT NOT NULL,
                store_id VARCHAR(10) REFERENCES store(store_id) ON DELETE SET NULL,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Order_items table
            `CREATE TABLE IF NOT EXISTS order_items (
                item_id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_num VARCHAR(20) REFERENCES "order"(order_num) ON DELETE CASCADE,
                product_code VARCHAR(20) REFERENCES product(code) ON DELETE SET NULL,
                quantity INTEGER NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Review table (VARCHAR ID)
            `CREATE TABLE IF NOT EXISTS review (
                review_id VARCHAR(20) PRIMARY KEY,
                client_id INTEGER REFERENCES client(client_id) ON DELETE SET NULL,
                product_code VARCHAR(20) REFERENCES product(code) ON DELETE CASCADE,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                review_date TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Request table (VARCHAR ID)
            `CREATE TABLE IF NOT EXISTS request (
                request_num VARCHAR(50) PRIMARY KEY,
                date_and_time TIMESTAMP NOT NULL,
                problem TEXT NOT NULL,
                client_id INTEGER REFERENCES client(client_id) ON DELETE SET NULL,
                store_id VARCHAR(10) REFERENCES store(store_id) ON DELETE CASCADE,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Refund table (VARCHAR ID)
            `CREATE TABLE IF NOT EXISTS refund (
                refund_id VARCHAR(50) PRIMARY KEY,
                order_num VARCHAR(20) REFERENCES "order"(order_num) ON DELETE CASCADE,
                amount DECIMAL(10,2) NOT NULL,
                reason TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                request_date TIMESTAMP NOT NULL,
                processed_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Report table (VARCHAR ID)
            `CREATE TABLE IF NOT EXISTS report (
                id VARCHAR(50) PRIMARY KEY,
                store_id VARCHAR(10) REFERENCES store(store_id) ON DELETE CASCADE,
                period VARCHAR(50) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                type VARCHAR(50) NOT NULL,
                generated_by VARCHAR(10) REFERENCES personal(id) ON DELETE SET NULL,
                generated_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Audit_log table (SERIAL ID)
            `CREATE TABLE IF NOT EXISTS audit_log (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id VARCHAR(50),
                action VARCHAR(100) NOT NULL,
                resource_type VARCHAR(50),
                resource_id VARCHAR(50),
                details TEXT,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Color table (SERIAL ID)
            `CREATE TABLE IF NOT EXISTS color (
                color_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(50) NOT NULL,
                hex_code VARCHAR(7) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Image table (SERIAL ID)
            `CREATE TABLE IF NOT EXISTS image (
                image_id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_code VARCHAR(20) REFERENCES product(code) ON DELETE CASCADE,
                image_url TEXT NOT NULL,
                is_primary BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Delivery_address table (SERIAL ID)
            `CREATE TABLE IF NOT EXISTS delivery_address (
                address_id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_id INTEGER REFERENCES client(client_id) ON DELETE CASCADE,
                address TEXT NOT NULL,
                city VARCHAR(100) NOT NULL,
                postcode VARCHAR(20) NOT NULL,
                country VARCHAR(100) NOT NULL,
                is_default BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Roles table (SERIAL ID)
            `CREATE TABLE IF NOT EXISTS roles (
                role_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // User_roles table (junction)
            `CREATE TABLE IF NOT EXISTS user_roles (
                user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, role_id)
            )`
        ];

        let index = 0;

        function runNext() {
            if (index >= createQueries.length) {
                console.log('✅ All tables created');
                resolve();
                return;
            }

            const tableName = createQueries[index].split('TABLE')[1].split('(')[0].trim().replace('IF NOT EXISTS', '').trim();
            console.log(`Creating table: ${tableName}...`);

            database.database.run(createQueries[index], [], (err) => {
                if (err) {
                    console.error(`Error creating table: ${err.message}`);
                    reject(err);
                    return;
                }
                console.log(`✅ Created table: ${tableName}`);
                index++;
                runNext();
            });
        }

        runNext();
    });
}

function createIndexes() {
    return new Promise((resolve, reject) => {
        console.log('📊 Creating indexes...');

        const indexQueries = [
            'CREATE INDEX IF NOT EXISTS idx_product_store ON product(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_product_category ON product(category_id)',
            'CREATE INDEX IF NOT EXISTS idx_order_client ON "order"(client_id)',
            'CREATE INDEX IF NOT EXISTS idx_order_store ON "order"(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_order_date ON "order"(order_date)',
            'CREATE INDEX IF NOT EXISTS idx_review_client ON review(client_id)',
            'CREATE INDEX IF NOT EXISTS idx_review_product ON review(product_code)',
            'CREATE INDEX IF NOT EXISTS idx_request_client ON request(client_id)',
            'CREATE INDEX IF NOT EXISTS idx_request_store ON request(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_refund_order ON refund(order_num)',
            'CREATE INDEX IF NOT EXISTS idx_refund_status ON refund(status)',
            'CREATE INDEX IF NOT EXISTS idx_personal_email ON personal(email)',
            'CREATE INDEX IF NOT EXISTS idx_client_email ON client(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)',
            'CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)',
            'CREATE INDEX IF NOT EXISTS idx_delivery_client ON delivery_address(client_id)',
            'CREATE INDEX IF NOT EXISTS idx_works_in_store_personal ON works_in_store(personal_id)',
            'CREATE INDEX IF NOT EXISTS idx_works_in_store_store ON works_in_store(store_id)'
        ];

        let index = 0;

        function runNext() {
            if (index >= indexQueries.length) {
                console.log('✅ Indexes created');
                resolve();
                return;
            }

            database.database.run(indexQueries[index], [], (err) => {
                if (err) {
                    console.log(`⚠️ Index creation warning for ${indexQueries[index].substring(0, 50)}...: ${err.message}`);
                }
                index++;
                runNext();
            });
        }

        runNext();
    });
}

function insertInitialData() {
    return new Promise((resolve, reject) => {
        console.log('📝 Inserting initial data...');

        // Insert default roles
        const roles = [
            { name: 'admin', description: 'System administrator' },
            { name: 'store_owner', description: 'Store owner' },
            { name: 'store_employee', description: 'Store employee' },
            { name: 'client', description: 'Registered client' },
            { name: 'guest', description: 'Unregistered guest' }
        ];

        let rolesInserted = 0;

        roles.forEach(role => {
            database.database.run(
                `INSERT INTO roles (name, description)
                 VALUES (?, ?)
                 ON CONFLICT DO NOTHING`,
                [role.name, role.description],
                (err) => {
                    if (err) {
                        console.error(`Error inserting role ${role.name}:`, err.message);
                    }
                    rolesInserted++;

                    if (rolesInserted === roles.length) {
                        console.log('✅ Roles inserted');
                        // Create admin user with ID 000000
                        createAdminUser();

                        // Ensure General category exists
                        database.ensureGeneralCategory((err) => {
                            if (err) {
                                console.error('Error ensuring General category:', err.message);
                            } else {
                                console.log('✅ General category checked/created');
                            }
                            resolve();
                        });
                    }
                }
            );
        });
    });
}

// Function to create admin user with ID 000000
function createAdminUser() {
    const adminId = '000000';
    const adminPassword = bcrypt.hashSync('Admin123!', 10);

    database.database.get(
        'SELECT * FROM users WHERE id = ? OR username = ? OR email = ?',
        [adminId, 'admin', 'admin@handcraft.com'],
        (err, existingAdmin) => {
            if (err) {
                console.error('Error checking for existing admin:', err.message);
                return;
            }

            if (!existingAdmin) {
                // Start a transaction
                database.database.run('BEGIN TRANSACTION', (err) => {
                    if (err) {
                        console.error('Error beginning transaction:', err);
                        return;
                    }

                    // Insert into users table
                    database.database.run(
                        `INSERT INTO users (id, username, email, password, user_type, force_password_change)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [adminId, 'admin', 'admin@handcraft.com', adminPassword, 'admin', 1],
                        function(err) {
                            if (err) {
                                database.database.run('ROLLBACK');
                                console.error('Error inserting admin user:', err.message);
                                return;
                            }

                            // Insert into personal table (required for boss table)
                            database.database.run(
                                `INSERT INTO personal (id, first_name, last_name, ssn, email, password)
                                 VALUES (?, ?, ?, ?, ?, ?)`,
                                [adminId, 'Admin', 'User', '0000000000000', 'admin@handcraft.com', adminPassword],
                                function(err) {
                                    if (err) {
                                        database.database.run('ROLLBACK');
                                        console.error('Error inserting admin personal:', err.message);
                                        return;
                                    }

                                    // Insert into boss table (store owner)
                                    database.database.run(
                                        `INSERT INTO boss (boss_id, signature)
                                         VALUES (?, ?)`,
                                        [adminId, 'Admin Signature'],
                                        function(err) {
                                            if (err) {
                                                database.database.run('ROLLBACK');
                                                console.error('Error inserting admin boss:', err.message);
                                                return;
                                            }

                                            // Insert into permissions
                                            database.database.run(
                                                `INSERT INTO permissions (personal_id, type, authorisation)
                                                 VALUES (?, ?, ?)`,
                                                [adminId, 'ADMIN', 'full_access'],
                                                function(err) {
                                                    if (err) {
                                                        console.error('Error inserting admin permissions:', err.message);
                                                        // Continue even if this fails
                                                    }

                                                    // Assign admin role
                                                    database.database.get(
                                                        'SELECT role_id FROM roles WHERE name = ?',
                                                        ['admin'],
                                                        (err, adminRole) => {
                                                            if (!err && adminRole) {
                                                                database.database.run(
                                                                    'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
                                                                    [adminId, adminRole.role_id],
                                                                    (err) => {
                                                                        if (err) {
                                                                            console.error('Error assigning admin role:', err.message);
                                                                        }
                                                                    }
                                                                );
                                                            }

                                                            database.database.run('COMMIT', (commitErr) => {
                                                                if (commitErr) {
                                                                    console.error('Error committing transaction:', commitErr);
                                                                    database.database.run('ROLLBACK');
                                                                } else {
                                                                    console.log('\n');
                                                                    console.log('🔐 ===== ADMIN CREDENTIALS =====');
                                                                    console.log('🆔 ID: 000000');
                                                                    console.log('👤 Username: admin');
                                                                    console.log('📧 Email: admin@handcraft.com');
                                                                    console.log('🔑 Password: Admin123!');
                                                                    console.log('⚠️ This is a first-time login. You will be required to change your password after 2FA verification.');
                                                                    console.log('================================\n');
                                                                }
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
            } else {
                console.log('✅ Admin user already exists with ID:', existingAdmin.id);
            }
        }
    );
}

// Initialize database on startup
(async function() {
    try {
        await initializeDatabase();
        console.log('✅ Database initialization completed');
    } catch (err) {
        console.error('❌ Database initialization failed:', err);
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
                    'SELECT boss_id FROM boss WHERE boss_id = ?',
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
                    'SELECT store_id FROM store WHERE store_email = ?',
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
                        'INSERT INTO store (store_id, name, date_of_founding, physical_address, store_email, rating) VALUES (?, ?, ?, ?, ?, ?)',
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
                                'INSERT INTO personal (id, first_name, last_name, ssn, email, password) VALUES (?, ?, ?, ?, ?, ?)',
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
                                        'INSERT INTO boss (boss_id, signature) VALUES (?, ?)',
                                        [tempStoreData.personalId, tempStoreData.signature],
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
                                                'INSERT INTO works_in_store (personal_id, store_id) VALUES (?, ?)',
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
                                                        'INSERT INTO permissions (personal_id, type, authorisation) VALUES (?, ?, ?)',
                                                        [tempStoreData.personalId, 'BOSS', 'full_access'],
                                                        (err) => {
                                                            if (err) {
                                                                console.error('Error inserting permissions:', err);
                                                            }

                                                            // Also create entry in users table for login with force_password_change = 1
                                                            database.database.run(
                                                                'INSERT INTO users (id, username, email, password, user_type, force_password_change) VALUES (?, ?, ?, ?, ?, ?)',
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
                                'INSERT INTO delivery_address (client_id, address, city, postcode, country, is_default) VALUES (?, ?, ?, ?, ?, ?)',
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
                                'SELECT boss_id FROM boss WHERE boss_id = ?',
                                [personal.id],
                                (err, boss) => {
                                    if (err) {
                                        console.error('Error checking boss status:', err);
                                    }

                                    if (boss) {
                                        // This is a store owner
                                        // Check if first time login from users table
                                        database.database.get(
                                            'SELECT force_password_change FROM users WHERE email = ?',
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
                                        'SELECT employee_id FROM employees WHERE employee_id = ?',
                                        [personal.id],
                                        (err, employee) => {
                                            if (err) {
                                                console.error('Error checking employee status:', err);
                                            }

                                            if (employee) {
                                                // This is an employee
                                                database.database.get(
                                                    'SELECT force_password_change FROM users WHERE email = ?',
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
                                                'SELECT * FROM users WHERE email = ?',
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
                'SELECT * FROM users WHERE email = ?',
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
                                    'SELECT boss_id FROM boss WHERE boss_id = ?',
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
                        'SELECT boss_id FROM boss WHERE boss_id = ?',
                        [personalId],
                        (err, boss) => {
                            if (err) {
                                console.error('Error checking boss:', err);
                            }

                            if (boss) {
                                database.database.all(
                                    `SELECT s.* FROM store s
                                     JOIN works_in_store w ON s.store_id = w.store_id
                                     WHERE w.personal_id = ?`,
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
                                    'SELECT employee_id FROM employees WHERE employee_id = ?',
                                    [personalId],
                                    (err, employee) => {
                                        if (err) {
                                            console.error('Error checking employee:', err);
                                        }

                                        if (employee) {
                                            database.database.all(
                                                `SELECT s.* FROM store s
                                                 JOIN works_in_store w ON s.store_id = w.store_id
                                                 WHERE w.personal_id = ?`,
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
                                parent_id: category.parent_id,
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
                        'SELECT COUNT(*) as order_count FROM "order" WHERE store_id = ? AND strftime("%Y", order_date) = ?',
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
                        'SELECT COUNT(*) as request_count FROM request WHERE store_id = ? AND strftime("%Y", date_and_time) = ? AND strftime("%m", date_and_time) = ?',
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
                        'SELECT store_id FROM "order" WHERE order_num = ?',
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
                                'SELECT COUNT(*) as refund_count FROM refund WHERE strftime("%Y", request_date) = ? AND strftime("%m", request_date) = ?',
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
                    'SELECT store_id FROM works_in_store WHERE personal_id = ?',
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
                            'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
                            [personalId, storeId],
                            (err, ownsStore) => {
                                if (err || !ownsStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to add products to this store' }));
                                    return;
                                }

                                // FIXED: Changed SQL syntax from SUBSTRING(code FROM 4) to SUBSTR(code, 4) for SQLite compatibility
                                database.database.get(
                                    'SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) as max_product_num FROM product WHERE store_id = ?',
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
                    'SELECT store_id FROM product WHERE code = ?',
                    [productData.code],
                    (err, product) => {
                        if (err || !product) {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Product not found' }));
                            return;
                        }

                        database.database.get(
                            'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                            'UPDATE users SET password = ?, force_password_change = 0 WHERE id = ?',
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
                                    'UPDATE personal SET password = ? WHERE id = ?',
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
                                    'UPDATE personal SET password = ? WHERE id = ?',
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
                                            'UPDATE users SET password = ?, force_password_change = 0 WHERE email = ?',
                                            [hashedPassword, personal.email],
                                            function(err) {
                                                if (err) {
                                                    console.log('No users record to update for email:', personal.email);
                                                }
                                            }
                                        );

                                        // Determine user type (boss/owner or employee)
                                        database.database.get(
                                            'SELECT boss_id FROM boss WHERE boss_id = ?',
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
                'SELECT boss_id FROM boss WHERE boss_id = ?',
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
                                            'INSERT INTO personal (id, first_name, last_name, ssn, email, password) VALUES (?, ?, ?, ?, ?, ?)',
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
                                                    'INSERT INTO employees (employee_id, date_of_hire) VALUES (?, ?)',
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
                                                            'INSERT INTO works_in_store (personal_id, store_id) VALUES (?, ?)',
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
                                                                    'INSERT INTO permissions (personal_id, type, authorisation) VALUES (?, ?, ?)',
                                                                    [newPersonalId, 'EMPLOYEE', 'limited_access'],
                                                                    (err) => {
                                                                        if (err) {
                                                                            console.error('Error inserting permissions:', err);
                                                                        }

                                                                        // Also create entry in users table for login with force_password_change = 1
                                                                        database.database.run(
                                                                            'INSERT INTO users (id, username, email, password, user_type, force_password_change) VALUES (?, ?, ?, ?, ?, ?)',
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
                'SELECT boss_id FROM boss WHERE boss_id = ?',
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
                            'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
                            [personalId, storeId],
                            (err, bossStore) => {
                                if (err || !bossStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to manage employees in this store' }));
                                    return;
                                }

                                database.database.get(
                                    'SELECT personal_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
                                    [employeeId, storeId],
                                    (err, employeeStore) => {
                                        if (err || !employeeStore) {
                                            res.writeHead(404, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'Employee not found in this store' }));
                                            return;
                                        }

                                        database.database.get(
                                            'SELECT boss_id FROM boss WHERE boss_id = ?',
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
                                                        'DELETE FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                                                                'DELETE FROM employees WHERE employee_id = ?',
                                                                [employeeId],
                                                                (err) => {
                                                                    if (err) {
                                                                        console.error('Error deleting from employees:', err);
                                                                    }

                                                                    database.database.run(
                                                                        'DELETE FROM permissions WHERE personal_id = ?',
                                                                        [employeeId],
                                                                        (err) => {
                                                                            if (err) {
                                                                                console.error('Error deleting from permissions:', err);
                                                                            }

                                                                            database.database.run(
                                                                                'DELETE FROM personal WHERE id = ?',
                                                                                [employeeId],
                                                                                (err) => {
                                                                                    if (err) {
                                                                                        console.error('Error deleting from personal:', err);
                                                                                    }

                                                                                    // Also delete from users table
                                                                                    database.database.run(
                                                                                        'DELETE FROM users WHERE id = ?',
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
                'SELECT boss_id FROM boss WHERE boss_id = ?',
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
                            'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
                            [personalId, storeId],
                            (err, bossStore) => {
                                if (err || !bossStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to manage employees in this store' }));
                                    return;
                                }

                                database.database.get(
                                    'SELECT personal_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                                            'UPDATE permissions SET type = ?, authorisation = ? WHERE personal_id = ?',
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
                'SELECT boss_id FROM boss WHERE boss_id = ?',
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
                            'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
                            [personalId, storeId],
                            (err, bossStore) => {
                                if (err || !bossStore) {
                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'You are not authorized to manage employees in this store' }));
                                    return;
                                }

                                database.database.get(
                                    'SELECT personal_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                                            updates.push('first_name = ?');
                                            params.push(firstName);
                                        }

                                        if (lastName) {
                                            updates.push('last_name = ?');
                                            params.push(lastName);
                                        }

                                        if (email) {
                                            if (!validateEmail(email)) {
                                                res.writeHead(400, { 'Content-Type': 'application/json' });
                                                res.end(JSON.stringify({ success: false, message: 'Invalid email format' }));
                                                return;
                                            }
                                            updates.push('email = ?');
                                            params.push(email);
                                        }

                                        if (updates.length === 0) {
                                            res.writeHead(400, { 'Content-Type': 'application/json' });
                                            res.end(JSON.stringify({ success: false, message: 'No fields to update' }));
                                            return;
                                        }

                                        params.push(employeeId);

                                        database.database.run(
                                            `UPDATE personal SET ${updates.join(', ')} WHERE id = ?`,
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
                                                        'UPDATE users SET email = ? WHERE id = ?',
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
                                                        'SELECT first_name, last_name FROM personal WHERE id = ?',
                                                        [employeeId],
                                                        (err, personal) => {
                                                            if (!err && personal) {
                                                                const newUsername = `${personal.first_name} ${personal.last_name}`;
                                                                database.database.run(
                                                                    'UPDATE users SET username = ? WHERE id = ?',
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
                    'SELECT store_id FROM works_in_store WHERE personal_id = ? LIMIT 1',
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
                'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                    'SELECT store_id FROM works_in_store WHERE personal_id = ? LIMIT 1',
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
                'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                    'SELECT store_id FROM works_in_store WHERE personal_id = ? LIMIT 1',
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
                'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                    'SELECT store_id FROM works_in_store WHERE personal_id = ? LIMIT 1',
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
                'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                    'SELECT store_id FROM works_in_store WHERE personal_id = ? LIMIT 1',
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
                'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                    'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
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
                const { storeId, period, startDate, endDate, type } = JSON.parse(body);

                if (!storeId || !period || !startDate || !endDate || !type) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'All fields are required' }));
                    return;
                }

                database.database.get(
                    'SELECT store_id FROM works_in_store WHERE personal_id = ? AND store_id = ?',
                    [personalId, storeId],
                    (err, ownsStore) => {
                        if (err || !ownsStore) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'You are not authorized to generate reports for this store' }));
                            return;
                        }

                        const reportId = 'RPT' + Date.now().toString().slice(-6);

                        database.database.run(
                            'INSERT INTO report (id, store_id, period, start_date, end_date, type, generated_by, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
                            [reportId, storeId, period, startDate, endDate, type, personalId],
                            function(err) {
                                if (err) {
                                    console.error('Error generating report:', err);
                                    res.writeHead(500, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ success: false, message: 'Error generating report: ' + err.message }));
                                } else {
                                    database.logAudit(personalId, 'REPORT_GENERATED', 'report', reportId, `Report generated: ${type} for ${period}`, ipAddress);

                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({
                                        success: true,
                                        message: 'Report generated successfully',
                                        reportId: reportId,
                                        report: {
                                            id: reportId,
                                            storeId: storeId,
                                            period: period,
                                            startDate: startDate,
                                            endDate: endDate,
                                            type: type,
                                            generatedBy: personalId,
                                            generatedAt: new Date().toISOString()
                                        }
                                    }));
                                }
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