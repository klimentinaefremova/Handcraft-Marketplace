const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dbPath = path.join(__dirname, 'database', 'handcraft.db');
const dbDir = path.dirname(dbPath);

// Create database directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const database = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('✅ Connected to SQLite database');
    }
});

// Enable foreign keys
database.run('PRAGMA foreign_keys = ON');

// Helper function to ensure general category exists
function ensureGeneralCategory(callback) {
    database.get('SELECT category_id FROM category WHERE name = ?', ['General'], (err, row) => {
        if (err) {
            callback(err);
        } else if (!row) {
            database.run(
                'INSERT INTO category (name, description) VALUES (?, ?)',
                ['General', 'General products category'],
                function(err) {
                    callback(err);
                }
            );
        } else {
            callback(null);
        }
    });
}

// Helper function to get the General category ID
function getGeneralCategoryId(callback) {
    database.get('SELECT category_id FROM category WHERE name = ?', ['General'], (err, row) => {
        if (err) {
            callback(err, null);
        } else if (row) {
            callback(null, row.category_id);
        } else {
            // Create General category if it doesn't exist
            database.run(
                'INSERT INTO category (name, description) VALUES (?, ?)',
                ['General', 'General products category'],
                function(err) {
                    if (err) {
                        callback(err, null);
                    } else {
                        callback(null, this.lastID);
                    }
                }
            );
        }
    });
}

// User functions
function getUserByUsername(username, callback) {
    database.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        callback(err, row);
    });
}

function getUserById(id, callback) {
    database.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
        if (err || !row) {
            callback(err, null);
            return;
        }

        // Get user roles
        database.all(
            `SELECT r.* FROM roles r
             JOIN user_roles ur ON r.role_id = ur.role_id
             WHERE ur.user_id = ?`,
            [id],
            (err, roles) => {
                if (err) {
                    callback(err, null);
                } else {
                    row.roles = roles || [];
                    callback(null, row);
                }
            }
        );
    });
}

function createUser(id, username, email, password, userType, callback) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    database.run(
        'INSERT INTO users (id, username, email, password, user_type) VALUES (?, ?, ?, ?, ?)',
        [id, username, email, hashedPassword, userType],
        function(err) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, id);
            }
        }
    );
}

// Client functions
function getClientByEmail(email, callback) {
    database.get('SELECT * FROM client WHERE email = ?', [email], (err, row) => {
        callback(err, row);
    });
}

function getClientById(id, callback) {
    database.get('SELECT * FROM client WHERE client_id = ?', [id], (err, row) => {
        callback(err, row);
    });
}

function createClient(clientData, callback) {
    const hashedPassword = bcrypt.hashSync(clientData.password, 10);
    database.run(
        'INSERT INTO client (first_name, last_name, email, password) VALUES (?, ?, ?, ?)',
        [clientData.first_name, clientData.last_name, clientData.email, hashedPassword],
        function(err) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, this.lastID);
            }
        }
    );
}

function verifyClientPassword(password, hashedPassword, callback) {
    try {
        const isValid = bcrypt.compareSync(password, hashedPassword);
        callback(null, isValid);
    } catch (err) {
        callback(err, false);
    }
}

// Personal functions
function getPersonalByEmail(email, callback) {
    database.get('SELECT * FROM personal WHERE email = ?', [email], (err, row) => {
        callback(err, row);
    });
}

function getPersonalById(id, callback) {
    database.get('SELECT * FROM personal WHERE id = ?', [id], (err, row) => {
        callback(err, row);
    });
}

// Password verification for regular users
function verifyPassword(password, hashedPassword) {
    return bcrypt.compareSync(password, hashedPassword);
}

// Password update
function updatePasswordAndClearForce(userId, newPassword, callback) {
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    database.run(
        'UPDATE users SET password = ?, force_password_change = 0 WHERE id = ?',
        [hashedPassword, userId],
        function(err) {
            callback(err);
        }
    );
}

// Product functions
function getProducts(categoryId, searchTerm, callback) {
    let query = `
        SELECT p.*, c.name as category_name, s.name as store_name
        FROM product p
        JOIN category c ON p.category_id = c.category_id
        JOIN store s ON p.store_id = s.store_id
        WHERE 1=1
    `;
    const params = [];

    if (categoryId && categoryId !== 'all') {
        query += ' AND p.category_id = ?';
        params.push(categoryId);
    }

    if (searchTerm) {
        query += ' AND (p.description LIKE ? OR p.code LIKE ?)';
        params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    database.all(query, params, (err, rows) => {
        if (err) {
            callback(err, null);
        } else {
            callback(null, rows || []);
        }
    });
}

function getProductById(id, callback) {
    database.get(
        `SELECT p.*, c.name as category_name, s.name as store_name
         FROM product p
         JOIN category c ON p.category_id = c.category_id
         JOIN store s ON p.store_id = s.store_id
         WHERE p.id = ?`,
        [id],
        (err, row) => {
            if (err || !row) {
                callback(err, null);
            } else {
                // Get images for product
                database.all(
                    'SELECT * FROM image WHERE product_code = ?',
                    [row.code],
                    (err, images) => {
                        if (err) {
                            callback(err, null);
                        } else {
                            row.images = images || [];
                            // Get colors for product
                            database.all(
                                'SELECT * FROM color WHERE product_code = ?',
                                [row.code],
                                (err, colors) => {
                                    if (err) {
                                        callback(err, null);
                                    } else {
                                        row.colors = colors || [];
                                        callback(null, row);
                                    }
                                }
                            );
                        }
                    }
                );
            }
        }
    );
}

function getProductByCode(code, callback) {
    database.get(
        `SELECT p.*, c.name as category_name, s.name as store_name
         FROM product p
         JOIN category c ON p.category_id = c.category_id
         JOIN store s ON p.store_id = s.store_id
         WHERE p.code = ?`,
        [code],
        (err, row) => {
            if (err || !row) {
                callback(err, null);
            } else {
                // Get images for product
                database.all(
                    'SELECT * FROM image WHERE product_code = ?',
                    [code],
                    (err, images) => {
                        if (err) {
                            callback(err, null);
                        } else {
                            row.images = images || [];
                            // Get colors for product
                            database.all(
                                'SELECT * FROM color WHERE product_code = ?',
                                [code],
                                (err, colors) => {
                                    if (err) {
                                        callback(err, null);
                                    } else {
                                        row.colors = colors || [];
                                        callback(null, row);
                                    }
                                }
                            );
                        }
                    }
                );
            }
        }
    );
}

function addProduct(personalId, productData, callback) {
    getGeneralCategoryId((err, generalCategoryId) => {
        if (err) {
            callback(err, null);
            return;
        }

        const categoryId = productData.category_id || generalCategoryId;

        // FIXED: Added validation for required fields
        if (!productData.code) {
            callback(new Error('Product code is required'), null);
            return;
        }

        if (!productData.store_id) {
            callback(new Error('Store ID is required'), null);
            return;
        }

        database.run(
            `INSERT INTO product (
                id, code, description, price, availability, weight, dimensions,
                production_time, category_id, store_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                'PROD_' + Date.now().toString().slice(-8), // Generate a unique ID
                productData.code,
                productData.description || 'No description',
                productData.price || 0,
                productData.availability || 0,
                productData.weight || 0,
                productData.dimensions || '0x0x0',
                productData.production_time || 1,
                categoryId,
                productData.store_id
            ],
            function(err) {
                if (err) {
                    callback(err, null);
                } else {
                    const productId = this.lastID;

                    // Log the change
                    database.run(
                        `INSERT INTO "change" (date_and_time, product_code, changes)
                         VALUES (datetime('now'), ?, ?)`,
                        [productData.code, 'Product created'],
                        function(err) {
                            if (err) {
                                console.error('Error logging product creation:', err);
                            }
                        }
                    );

                    // Log who made the change
                    database.run(
                        `INSERT INTO makes_change (personal_id, change_date_time, product_code)
                         VALUES (?, datetime('now'), ?)`,
                        [personalId, productData.code],
                        function(err) {
                            if (err) {
                                console.error('Error logging change maker:', err);
                            }
                        }
                    );

                    // Insert images if provided
                    if (productData.images && Array.isArray(productData.images) && productData.images.length > 0) {
                        productData.images.forEach((imageUrl, index) => {
                            database.run(
                                `INSERT INTO image (product_code, image_url, is_primary)
                                 VALUES (?, ?, ?)`,
                                [productData.code, imageUrl, index === 0 ? 1 : 0],
                                function(err) {
                                    if (err) {
                                        console.error('Error inserting image:', err);
                                    }
                                }
                            );
                        });
                    }

                    // Insert colors if provided
                    if (productData.colors && Array.isArray(productData.colors) && productData.colors.length > 0) {
                        productData.colors.forEach(color => {
                            database.run(
                                `INSERT INTO color (product_code, name)
                                 VALUES (?, ?)`,
                                [productData.code, color],
                                function(err) {
                                    if (err) {
                                        console.error('Error inserting color:', err);
                                    }
                                }
                            );
                        });
                    }

                    callback(null, productId);
                }
            }
        );
    });
}

function updateProduct(personalId, productData, callback) {
    const updates = [];
    const params = [];

    if (productData.description !== undefined) {
        updates.push('description = ?');
        params.push(productData.description);
    }
    if (productData.price !== undefined) {
        updates.push('price = ?');
        params.push(productData.price);
    }
    if (productData.availability !== undefined) {
        updates.push('availability = ?');
        params.push(productData.availability);
    }
    if (productData.weight !== undefined) {
        updates.push('weight = ?');
        params.push(productData.weight);
    }
    if (productData.dimensions !== undefined) {
        updates.push('dimensions = ?');
        params.push(productData.dimensions);
    }
    if (productData.production_time !== undefined) {
        updates.push('production_time = ?');
        params.push(productData.production_time);
    }
    if (productData.category_id !== undefined) {
        updates.push('category_id = ?');
        params.push(productData.category_id);
    }

    if (updates.length === 0) {
        callback(null, 0);
        return;
    }

    params.push(productData.code);

    database.run(
        `UPDATE product SET ${updates.join(', ')} WHERE code = ?`,
        params,
        function(err) {
            if (err) {
                callback(err, null);
            } else {
                // Log the change
                const changesDesc = `Product updated: ${updates.join(', ')}`;
                database.run(
                    `INSERT INTO "change" (date_and_time, product_code, changes)
                     VALUES (datetime('now'), ?, ?)`,
                    [productData.code, changesDesc],
                    function(err) {
                        if (err) {
                            console.error('Error logging product update:', err);
                        }
                        // Log who made the change
                        database.run(
                            `INSERT INTO makes_change (personal_id, change_date_time, product_code)
                             VALUES (?, datetime('now'), ?)`,
                            [personalId, productData.code],
                            function(err) {
                                if (err) {
                                    console.error('Error logging change maker:', err);
                                }
                            }
                        );
                    }
                );

                // Handle images if provided
                if (productData.images && Array.isArray(productData.images)) {
                    // Delete old images first
                    database.run('DELETE FROM image WHERE product_code = ?', [productData.code], (err) => {
                        if (!err) {
                            // Insert new images
                            productData.images.forEach(image => {
                                database.run(
                                    'INSERT INTO image (product_code, image) VALUES (?, ?)',
                                    [productData.code, image]
                                );
                            });
                        }
                    });
                }

                // Handle colors if provided
                if (productData.colors && Array.isArray(productData.colors)) {
                    // Delete old colors first
                    database.run('DELETE FROM color WHERE product_code = ?', [productData.code], (err) => {
                        if (!err) {
                            // Insert new colors
                            productData.colors.forEach(color => {
                                database.run(
                                    'INSERT INTO color (product_code, color) VALUES (?, ?)',
                                    [productData.code, color]
                                );
                            });
                        }
                    });
                }

                callback(null, this.changes);
            }
        }
    );
}

function deleteProduct(productCode, storeId, personalId, callback) {
    database.run('BEGIN TRANSACTION', (err) => {
        if (err) {
            callback(err);
            return;
        }

        // Log the deletion
        database.run(
            `INSERT INTO "change" (date_and_time, product_code, changes)
             VALUES (datetime('now'), ?, ?)`,
            [productCode, 'Product deleted'],
            function(err) {
                if (err) {
                    database.run('ROLLBACK');
                    callback(err);
                    return;
                }

                // Log who deleted it
                database.run(
                    `INSERT INTO makes_change (personal_id, change_date_time, product_code)
                     VALUES (?, datetime('now'), ?)`,
                    [personalId, productCode],
                    function(err) {
                        if (err) {
                            database.run('ROLLBACK');
                            callback(err);
                            return;
                        }

                        // Delete the product (cascades to image, color)
                        database.run(
                            'DELETE FROM product WHERE code = ? AND store_id = ?',
                            [productCode, storeId],
                            function(err) {
                                if (err) {
                                    database.run('ROLLBACK');
                                    callback(err);
                                } else {
                                    database.run('COMMIT', callback);
                                }
                            }
                        );
                    }
                );
            }
        );
    });
}

// Category functions
function getCategories(callback) {
    database.all('SELECT * FROM category ORDER BY name', [], (err, rows) => {
        callback(err, rows || []);
    });
}

function getCategoriesWithParents(callback) {
    database.all(
        `SELECT c1.*, c2.name as parent_name
         FROM category c1
         LEFT JOIN category c2 ON c1.parent_category_id = c2.category_id
         ORDER BY c1.name`,
        [],
        (err, rows) => {
            callback(err, rows || []);
        }
    );
}

function createCategory(categoryData, callback) {
    database.run(
        'INSERT INTO category (name, description, parent_category_id) VALUES (?, ?, ?)',
        [categoryData.name, categoryData.description || null, categoryData.parent_id || null],
        function(err) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, {
                    id: this.lastID,
                    name: categoryData.name,
                    parent_id: categoryData.parent_id,
                    description: categoryData.description
                });
            }
        }
    );
}

// Store functions
function getStores(callback) {
    database.all('SELECT * FROM store ORDER BY name', [], (err, rows) => {
        callback(err, rows || []);
    });
}

function getStoreProducts(storeId, callback) {
    database.all(
        `SELECT p.*, c.name as category_name
         FROM product p
         JOIN category c ON p.category_id = c.category_id
         WHERE p.store_id = ?
         ORDER BY p.code`,
        [storeId],
        (err, rows) => {
            if (err) {
                callback(err, null);
            } else {
                callback(null, rows || []);
            }
        }
    );
}

function getStoreOrders(storeId, callback) {
    database.all(
        `SELECT o.*, c.first_name, c.last_name
         FROM "order" o
         JOIN client c ON o.client_id = c.client_id
         WHERE o.store_id = ?
         ORDER BY o.order_date DESC`,
        [storeId],
        (err, rows) => {
            if (err) {
                callback(err, null);
            } else {
                // Get order items for each order
                let completed = 0;
                const orders = rows || [];

                if (orders.length === 0) {
                    callback(null, []);
                    return;
                }

                orders.forEach(order => {
                    database.all(
                        `SELECT oi.*, p.description
                         FROM order_items oi
                         JOIN product p ON oi.product_code = p.code
                         WHERE oi.order_num = ?`,
                        [order.order_num],
                        (err, items) => {
                            if (!err) {
                                order.items = items || [];
                            } else {
                                order.items = [];
                            }

                            completed++;
                            if (completed === orders.length) {
                                callback(null, orders);
                            }
                        }
                    );
                });
            }
        }
    );
}

function getStoreEmployees(storeId, callback) {
    database.all(
        `SELECT p.*, e.date_of_hire, perm.type as permission_type, perm.authorisation
         FROM personal p
         JOIN works_in_store w ON p.id = w.personal_id
         LEFT JOIN employees e ON p.id = e.employee_id
         LEFT JOIN permissions perm ON p.id = perm.personal_id
         WHERE w.store_id = ?`,
        [storeId],
        (err, rows) => {
            callback(err, rows || []);
        }
    );
}

function getStoreReports(storeId, callback) {
    database.all(
        `SELECT * FROM report
         WHERE store_id = ?
         ORDER BY generated_at DESC`,
        [storeId],
        (err, rows) => {
            callback(err, rows || []);
        }
    );
}

function getStoreStats(storeId, callback) {
    const stats = {};

    // Get total products
    database.get(
        'SELECT COUNT(*) as total_products FROM product WHERE store_id = ?',
        [storeId],
        (err, row) => {
            stats.total_products = row ? row.total_products : 0;

            // Get total orders
            database.get(
                'SELECT COUNT(*) as total_orders FROM "order" WHERE store_id = ?',
                [storeId],
                (err, row) => {
                    stats.total_orders = row ? row.total_orders : 0;

                    // Get total revenue
                    database.get(
                        `SELECT SUM(oi.price * oi.quantity) as total_revenue
                         FROM order_items oi
                         JOIN "order" o ON oi.order_num = o.order_num
                         WHERE o.store_id = ?`,
                        [storeId],
                        (err, row) => {
                            stats.total_revenue = row && row.total_revenue ? row.total_revenue : 0;

                            // Get average rating
                            database.get(
                                `SELECT AVG(rating) as avg_rating
                                 FROM review r
                                 JOIN product p ON r.product_code = p.code
                                 WHERE p.store_id = ?`,
                                [storeId],
                                (err, row) => {
                                    stats.avg_rating = row && row.avg_rating ? row.avg_rating : 0;

                                    callback(null, stats);
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}

// Order functions
function createOrderNew(orderData, callback) {
    database.run('BEGIN TRANSACTION', (err) => {
        if (err) {
            callback(err, null);
            return;
        }

        database.run(
            `INSERT INTO "order" (order_num, client_id, order_date, quantity, payment_method,
                                 discount, delivery_address, store_id)
             VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)`,
            [
                orderData.order_num,
                orderData.client_id,
                orderData.quantity,
                orderData.payment_method,
                orderData.discount,
                orderData.delivery_address,
                orderData.store_id
            ],
            function(err) {
                if (err) {
                    database.run('ROLLBACK');
                    callback(err, null);
                    return;
                }

                let itemsInserted = 0;
                const items = orderData.items || [];

                if (items.length === 0) {
                    database.run('COMMIT');
                    callback(null, orderData.order_num);
                    return;
                }

                items.forEach(item => {
                    database.run(
                        `INSERT INTO order_items (order_num, product_code, quantity, price)
                         VALUES (?, ?, ?, ?)`,
                        [orderData.order_num, item.product_code, item.quantity, item.price],
                        function(err) {
                            if (err) {
                                database.run('ROLLBACK');
                                callback(err, null);
                                return;
                            }

                            itemsInserted++;
                            if (itemsInserted === items.length) {
                                database.run('COMMIT', (err) => {
                                    if (err) {
                                        callback(err, null);
                                    } else {
                                        callback(null, orderData.order_num);
                                    }
                                });
                            }
                        }
                    );
                });
            }
        );
    });
}

function getOrdersByClient(clientId, callback) {
    database.all(
        `SELECT o.*, s.name as store_name
         FROM "order" o
         JOIN store s ON o.store_id = s.store_id
         WHERE o.client_id = ?
         ORDER BY o.order_date DESC`,
        [clientId],
        (err, rows) => {
            if (err) {
                callback(err, null);
            } else {
                // Get order items for each order
                let completed = 0;
                const orders = rows || [];

                if (orders.length === 0) {
                    callback(null, []);
                    return;
                }

                orders.forEach(order => {
                    database.all(
                        `SELECT oi.*, p.description
                         FROM order_items oi
                         JOIN product p ON oi.product_code = p.code
                         WHERE oi.order_num = ?`,
                        [order.order_num],
                        (err, items) => {
                            if (!err) {
                                order.items = items || [];
                            } else {
                                order.items = [];
                            }

                            completed++;
                            if (completed === orders.length) {
                                callback(null, orders);
                            }
                        }
                    );
                });
            }
        }
    );
}

function getAllOrders(callback) {
    database.all(
        `SELECT o.*, c.first_name, c.last_name, s.name as store_name
         FROM "order" o
         JOIN client c ON o.client_id = c.client_id
         JOIN store s ON o.store_id = s.store_id
         ORDER BY o.order_date DESC`,
        [],
        (err, rows) => {
            callback(err, rows || []);
        }
    );
}

// Review functions
function createReviewNew(reviewData, callback) {
    database.run(
        `INSERT INTO review (review_id, client_id, product_code, rating, comment, review_date)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [
            'REV' + Date.now().toString().slice(-8),
            reviewData.client_id,
            reviewData.product_code,
            reviewData.rating,
            reviewData.comment || ''
        ],
        function(err) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, this.lastID);
            }
        }
    );
}

// Request functions
function createRequest(requestData, callback) {
    database.run(
        `INSERT INTO request (request_num, date_and_time, problem, client_id, store_id)
         VALUES (?, ?, ?, ?, ?)`,
        [
            requestData.request_num,
            requestData.date_and_time,
            requestData.problem,
            requestData.client_id,
            requestData.store_id
        ],
        function(err) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, requestData.request_num);
            }
        }
    );
}

// Refund functions
function createRefund(refundData, callback) {
    database.run(
        `INSERT INTO refund (refund_id, order_num, amount, reason, request_date)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [
            refundData.refund_id,
            refundData.order_num,
            refundData.amount,
            refundData.reason
        ],
        function(err) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, refundData.refund_id);
            }
        }
    );
}

// Employee task functions
function getEmployeeTasks(personalId, storeId, callback) {
    const tasks = {
        pending_orders: [],
        pending_requests: [],
        pending_refunds: []
    };

    // Get pending orders
    database.all(
        `SELECT o.*, c.first_name, c.last_name
         FROM "order" o
         JOIN client c ON o.client_id = c.client_id
         WHERE o.store_id = ? AND o.status = 'pending'
         ORDER BY o.order_date ASC`,
        [storeId],
        (err, rows) => {
            if (!err) {
                tasks.pending_orders = rows || [];
            }

            // Get pending requests
            database.all(
                `SELECT r.*, c.first_name, c.last_name
                 FROM request r
                 JOIN client c ON r.client_id = c.client_id
                 WHERE r.store_id = ? AND r.status = 'pending'
                 ORDER BY r.date_and_time ASC`,
                [storeId],
                (err, rows) => {
                    if (!err) {
                        tasks.pending_requests = rows || [];
                    }

                    // Get pending refunds
                    database.all(
                        `SELECT rf.*, o.client_id, c.first_name, c.last_name
                         FROM refund rf
                         JOIN "order" o ON rf.order_num = o.order_num
                         JOIN client c ON o.client_id = c.client_id
                         WHERE o.store_id = ? AND rf.status = 'pending'
                         ORDER BY rf.request_date ASC`,
                        [storeId],
                        (err, rows) => {
                            if (!err) {
                                tasks.pending_refunds = rows || [];
                            }
                            callback(null, tasks);
                        }
                    );
                }
            );
        }
    );
}

// Client stats functions
function getClientStats(clientId, callback) {
    const stats = {};

    // Get total orders
    database.get(
        'SELECT COUNT(*) as total_orders FROM "order" WHERE client_id = ?',
        [clientId],
        (err, row) => {
            stats.total_orders = row ? row.total_orders : 0;

            // Get total spent
            database.get(
                `SELECT SUM(oi.price * oi.quantity) as total_spent
                 FROM order_items oi
                 JOIN "order" o ON oi.order_num = o.order_num
                 WHERE o.client_id = ?`,
                [clientId],
                (err, row) => {
                    stats.total_spent = row && row.total_spent ? row.total_spent : 0;

                    // Get pending orders
                    database.get(
                        'SELECT COUNT(*) as pending_orders FROM "order" WHERE client_id = ? AND status = "pending"',
                        [clientId],
                        (err, row) => {
                            stats.pending_orders = row ? row.pending_orders : 0;

                            // Get delivered orders
                            database.get(
                                'SELECT COUNT(*) as delivered_orders FROM "order" WHERE client_id = ? AND status = "delivered"',
                                [clientId],
                                (err, row) => {
                                    stats.delivered_orders = row ? row.delivered_orders : 0;

                                    callback(null, stats);
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}

// User functions for admin
function getAllUsers(callback) {
    const users = [];

    // Get client users
    database.all(
        `SELECT client_id as id, first_name, last_name, email, 'client' as user_type
         FROM client
         ORDER BY client_id`,
        [],
        (err, rows) => {
            if (!err) {
                users.push(...(rows || []));
            }

            // Get personal users
            database.all(
                `SELECT p.id, p.first_name, p.last_name, p.email,
                        CASE WHEN b.boss_id IS NOT NULL THEN 'store_owner'
                             WHEN e.employee_id IS NOT NULL THEN 'store_employee'
                             ELSE 'personal' END as user_type
                 FROM personal p
                 LEFT JOIN boss b ON p.id = b.boss_id
                 LEFT JOIN employees e ON p.id = e.employee_id
                 ORDER BY p.id`,
                [],
                (err, rows) => {
                    if (!err) {
                        users.push(...(rows || []));
                    }

                    // Get system users
                    database.all(
                        `SELECT id, username, email, user_type
                         FROM users
                         ORDER BY id`,
                        [],
                        (err, rows) => {
                            if (!err) {
                                users.push(...(rows || []));
                            }
                            callback(null, users);
                        }
                    );
                }
            );
        }
    );
}

// Audit log function
function logAudit(userId, action, resourceType, resourceId, details, ipAddress) {
    database.run(
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, action, resourceType, resourceId, details, ipAddress],
        (err) => {
            if (err) {
                console.error('Error logging audit:', err);
            }
        }
    );
}

module.exports = {
    database,
    ensureGeneralCategory,
    getGeneralCategoryId,
    getUserByUsername,
    getUserById,
    createUser,
    getClientByEmail,
    getClientById,
    createClient,
    verifyClientPassword,
    getPersonalByEmail,
    getPersonalById,
    verifyPassword,
    updatePasswordAndClearForce,
    getProducts,
    getProductById,
    getProductByCode,
    addProduct,
    updateProduct,
    deleteProduct,
    getCategories,
    getCategoriesWithParents,
    createCategory,
    getStores,
    getStoreProducts,
    getStoreOrders,
    getStoreEmployees,
    getStoreReports,
    getStoreStats,
    createOrderNew,
    getOrdersByClient,
    getAllOrders,
    createReviewNew,
    createRequest,
    createRefund,
    getEmployeeTasks,
    getClientStats,
    getAllUsers,
    logAudit
};