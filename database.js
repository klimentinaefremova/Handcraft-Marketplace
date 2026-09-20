const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

/*
 * ============================================================
 * PostgreSQL CONNECTION
 * ============================================================
 *
 * Put your actual FINKI connection information in .env
 *
 * Example:
 *
 * PGHOST=localhost
 * PGPORT=5432
 * PGDATABASE=handcraft
 * PGUSER=your_username
 * PGPASSWORD=your_password
 *
 * If you use the SSH tunnel, PGHOST/PGPORT will normally
 * point to the LOCAL end of the SSH tunnel.
 */

const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'db_202526z_va_prj_handcraft_store',
    user: process.env.PGUSER || 'db_202526z_va_prj_handcraft_store_owner',
    password: process.env.PGPASSWORD || '',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected PostgreSQL pool error:', err);
});

/*
 * ============================================================
 * HELPER
 * ============================================================
 */

function query(text, params = [], callback) {
    pool.query(text, params)
        .then(result => {
            callback(null, result);
        })
        .catch(err => {
            callback(err, null);
        });
}


/*
 * ============================================================
 * GENERAL CATEGORY
 * ============================================================
 */

function ensureGeneralCategory(callback) {

    query(
        `SELECT category_id, name
         FROM category
         WHERE category_id = 1`,
        [],
        (err, result) => {

            if (err) {
                callback(err);
                return;
            }

            const row = result.rows[0];

            if (row && row.name === 'General') {

                console.log('✅ General category exists with ID: 1');
                callback(null);

            } else if (row && row.name !== 'General') {

                query(
                    `UPDATE category
                     SET name = $1,
                         description = $2
                     WHERE category_id = 1`,
                    ['General', 'General products category'],
                    (err) => {

                        if (err) {
                            callback(err);
                        } else {
                            console.log('✅ Updated category ID 1 to General');
                            callback(null);
                        }
                    }
                );

            } else {

                query(
                    `INSERT INTO category
                        (category_id, name, description)
                     VALUES
                        (1, $1, $2)
                     ON CONFLICT (category_id) DO NOTHING`,
                    ['General', 'General products category'],
                    (err) => {

                        if (err) {
                            callback(err);
                        } else {
                            console.log('✅ Created General category with ID: 1');
                            callback(null);
                        }
                    }
                );
            }
        }
    );
}


function getGeneralCategoryId(callback) {

    query(
        `SELECT category_id
         FROM category
         WHERE category_id = 1
           AND name = $1`,
        ['General'],
        (err, result) => {

            if (err) {
                callback(err, null);
                return;
            }

            if (result.rows.length > 0) {
                callback(null, result.rows[0].category_id);
                return;
            }

            query(
                `SELECT category_id
                 FROM category
                 WHERE name = $1`,
                ['General'],
                (err, result) => {

                    if (err) {
                        callback(err, null);
                        return;
                    }

                    if (result.rows.length > 0) {
                        callback(null, result.rows[0].category_id);
                        return;
                    }

                    query(
                        `INSERT INTO category
                            (name, description)
                         VALUES
                            ($1, $2)
                         RETURNING category_id`,
                        ['General', 'General products category'],
                        (err, result) => {

                            if (err) {
                                callback(err, null);
                            } else {
                                const newId = result.rows[0].category_id;

                                console.log(
                                    `✅ Created new General category with ID: ${newId}`
                                );

                                callback(null, newId);
                            }
                        }
                    );
                }
            );
        }
    );
}


/*
 * ============================================================
 * USER FUNCTIONS
 * ============================================================
 */

function getUserByUsername(username, callback) {

    query(
        `SELECT *
         FROM users
         WHERE username = $1`,
        [username],
        (err, result) => {

            callback(
                err,
                result ? result.rows[0] : null
            );
        }
    );
}


function getUserById(id, callback) {

    query(
        `SELECT *
         FROM users
         WHERE id = $1`,
        [id],
        (err, result) => {

            if (err || !result || result.rows.length === 0) {
                callback(err, null);
                return;
            }

            const row = result.rows[0];

            query(
                `SELECT r.*
                 FROM roles r
                 JOIN user_roles ur
                   ON r.role_id = ur.role_id
                 WHERE ur.user_id = $1`,
                [id],
                (err, result) => {

                    if (err) {
                        callback(err, null);
                    } else {
                        row.roles = result.rows || [];
                        callback(null, row);
                    }
                }
            );
        }
    );
}


function createUser(id, username, email, password, userType, callback) {

    const hashedPassword = bcrypt.hashSync(password, 10);

    query(
        `INSERT INTO users
            (id, username, email, password, user_type)
         VALUES
            ($1, $2, $3, $4, $5)`,
        [id, username, email, hashedPassword, userType],
        (err) => {

            if (err) {
                callback(err, null);
            } else {
                callback(null, id);
            }
        }
    );
}


/*
 * ============================================================
 * CLIENT FUNCTIONS
 * ============================================================
 */

function getClientByEmail(email, callback) {

    query(
        `SELECT *
         FROM client
         WHERE email = $1`,
        [email],
        (err, result) => {

            callback(
                err,
                result ? result.rows[0] : null
            );
        }
    );
}


function getClientById(id, callback) {

    query(
        `SELECT *
         FROM client
         WHERE client_id = $1`,
        [id],
        (err, result) => {

            callback(
                err,
                result ? result.rows[0] : null
            );
        }
    );
}


function createClient(clientData, callback) {

    const hashedPassword =
        bcrypt.hashSync(clientData.password, 10);

    query(
        `INSERT INTO client
            (first_name, last_name, email, password)
         VALUES
            ($1, $2, $3, $4)
         RETURNING client_id`,
        [
            clientData.first_name,
            clientData.last_name,
            clientData.email,
            hashedPassword
        ],
        (err, result) => {

            if (err) {
                callback(err, null);
            } else {
                callback(
                    null,
                    result.rows[0].client_id
                );
            }
        }
    );
}


function verifyClientPassword(
    password,
    hashedPassword,
    callback
) {

    try {

        const isValid =
            bcrypt.compareSync(password, hashedPassword);

        callback(null, isValid);

    } catch (err) {

        callback(err, false);
    }
}


/*
 * ============================================================
 * PERSONAL / EMPLOYEE FUNCTIONS
 * ============================================================
 */

function getPersonalByEmail(email, callback) {

    query(
        `SELECT *
         FROM personal
         WHERE email = $1`,
        [email],
        (err, result) => {

            callback(
                err,
                result ? result.rows[0] : null
            );
        }
    );
}


function getPersonalById(id, callback) {

    query(
        `SELECT *
         FROM personal
         WHERE id = $1`,
        [id],
        (err, result) => {

            callback(
                err,
                result ? result.rows[0] : null
            );
        }
    );
}


function verifyPassword(password, hashedPassword) {
    return bcrypt.compareSync(password, hashedPassword);
}


function updatePasswordAndClearForce(
    userId,
    newPassword,
    callback
) {

    const hashedPassword =
        bcrypt.hashSync(newPassword, 10);

    query(
        `UPDATE users
         SET password = $1,
             force_password_change = 0
         WHERE id = $2`,
        [hashedPassword, userId],
        (err) => {

            callback(err);
        }
    );
}


/*
 * ============================================================
 * PRODUCT FUNCTIONS
 * ============================================================
 */

function getProducts(categoryId, searchTerm, callback) {

    let queryText = `
        SELECT
            p.*,
            c.name AS category_name,
            s.name AS store_name
        FROM product p
        JOIN category c
          ON p.category_id = c.category_id
        JOIN store s
          ON p.store_id = s.store_id
        WHERE 1 = 1
    `;

    const params = [];
    let paramIndex = 1;

    if (categoryId && categoryId !== 'all') {

        queryText +=
            ` AND p.category_id = $${paramIndex}`;

        params.push(categoryId);
        paramIndex++;
    }

    if (searchTerm) {

        queryText +=
            ` AND (
                p.description ILIKE $${paramIndex}
                OR p.code ILIKE $${paramIndex + 1}
            )`;

        params.push(`%${searchTerm}%`);
        params.push(`%${searchTerm}%`);

        paramIndex += 2;
    }

    queryText += ` ORDER BY p.code`;

    query(
        queryText,
        params,
        (err, result) => {

            if (err) {
                callback(err, null);
            } else {
                callback(null, result.rows || []);
            }
        }
    );
}


function getProductById(id, callback) {

    query(
        `SELECT
            p.*,
            c.name AS category_name,
            s.name AS store_name
         FROM product p
         JOIN category c
           ON p.category_id = c.category_id
         JOIN store s
           ON p.store_id = s.store_id
         WHERE p.id = $1`,
        [id],
        (err, result) => {

            if (err || result.rows.length === 0) {
                callback(err, null);
                return;
            }

            const row = result.rows[0];

            query(
                `SELECT *
                 FROM image
                 WHERE product_code = $1`,
                [row.code],
                (err, result) => {

                    if (err) {
                        callback(err, null);
                        return;
                    }

                    row.images = result.rows || [];

                    query(
                        `SELECT *
                         FROM color
                         WHERE product_code = $1`,
                        [row.code],
                        (err, result) => {

                            if (err) {
                                callback(err, null);
                            } else {
                                row.colors =
                                    result.rows || [];

                                callback(null, row);
                            }
                        }
                    );
                }
            );
        }
    );
}


function getProductByCode(code, callback) {

    query(
        `SELECT
            p.*,
            c.name AS category_name,
            s.name AS store_name
         FROM product p
         JOIN category c
           ON p.category_id = c.category_id
         JOIN store s
           ON p.store_id = s.store_id
         WHERE p.code = $1`,
        [code],
        (err, result) => {

            if (err || result.rows.length === 0) {
                callback(err, null);
                return;
            }

            const row = result.rows[0];

            query(
                `SELECT *
                 FROM image
                 WHERE product_code = $1`,
                [code],
                (err, result) => {

                    if (err) {
                        callback(err, null);
                        return;
                    }

                    row.images = result.rows || [];

                    query(
                        `SELECT *
                         FROM color
                         WHERE product_code = $1`,
                        [code],
                        (err, result) => {

                            if (err) {
                                callback(err, null);
                            } else {

                                row.colors =
                                    result.rows || [];

                                callback(null, row);
                            }
                        }
                    );
                }
            );
        }
    );
}


function addProduct(personalId, productData, callback) {

    getGeneralCategoryId((err, generalCategoryId) => {

        if (err) {
            callback(err, null);
            return;
        }

        const categoryId =
            productData.category_id || generalCategoryId;

        if (!productData.code) {
            callback(
                new Error('Product code is required'),
                null
            );
            return;
        }

        if (!productData.store_id) {
            callback(
                new Error('Store ID is required'),
                null
            );
            return;
        }

        const productId =
            'PROD_' +
            Date.now().toString().slice(-8);

        query(
            `INSERT INTO product
                (
                    id,
                    code,
                    description,
                    price,
                    availability,
                    weight,
                    dimensions,
                    production_time,
                    category_id,
                    store_id,
                    created_at
                )
             VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    NOW()
                )
             RETURNING id`,
            [
                productId,
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
            (err, result) => {

                if (err) {
                    callback(err, null);
                    return;
                }

                const returnedId = result.rows[0].id;

                /*
                 * Log product creation
                 */
                query(
                    `INSERT INTO "change"
                        (date_and_time, product_code, changes)
                     VALUES
                        (NOW(), $1, $2)`,
                    [
                        productData.code,
                        'Product created'
                    ],
                    (err) => {

                        if (err) {
                            console.error(
                                'Error logging product creation:',
                                err
                            );
                        }
                    }
                );

                /*
                 * Log who made the change
                 */
                query(
                    `INSERT INTO makes_change
                        (
                            personal_id,
                            change_date_time,
                            product_code
                        )
                     VALUES
                        ($1, NOW(), $2)`,
                    [
                        personalId,
                        productData.code
                    ],
                    (err) => {

                        if (err) {
                            console.error(
                                'Error logging change maker:',
                                err
                            );
                        }
                    }
                );

                /*
                 * Insert images
                 */
                if (
                    productData.images &&
                    Array.isArray(productData.images) &&
                    productData.images.length > 0
                ) {

                    productData.images.forEach(
                        (imageUrl, index) => {

                            query(
                                `INSERT INTO image
                                    (
                                        product_code,
                                        image_url,
                                        is_primary
                                    )
                                 VALUES
                                    ($1, $2, $3)`,
                                [
                                    productData.code,
                                    imageUrl,
                                    index === 0
                                ],
                                (err) => {

                                    if (err) {
                                        console.error(
                                            'Error inserting image:',
                                            err
                                        );
                                    }
                                }
                            );
                        }
                    );
                }

                /*
                 * Insert colors
                 */
                if (
                    productData.colors &&
                    Array.isArray(productData.colors) &&
                    productData.colors.length > 0
                ) {

                    productData.colors.forEach(color => {

                        query(
                            `INSERT INTO color
                                (product_code, name)
                             VALUES
                                ($1, $2)`,
                            [
                                productData.code,
                                color
                            ],
                            (err) => {

                                if (err) {
                                    console.error(
                                        'Error inserting color:',
                                        err
                                    );
                                }
                            }
                        );
                    });
                }

                callback(null, returnedId);
            }
        );
    });
}


function updateProduct(
    personalId,
    productData,
    callback
) {

    const updates = [];
    const params = [];

    if (productData.description !== undefined) {
        updates.push(`description = $${params.length + 1}`);
        params.push(productData.description);
    }

    if (productData.price !== undefined) {
        updates.push(`price = $${params.length + 1}`);
        params.push(productData.price);
    }

    if (productData.availability !== undefined) {
        updates.push(`availability = $${params.length + 1}`);
        params.push(productData.availability);
    }

    if (productData.weight !== undefined) {
        updates.push(`weight = $${params.length + 1}`);
        params.push(productData.weight);
    }

    if (productData.dimensions !== undefined) {
        updates.push(`dimensions = $${params.length + 1}`);
        params.push(productData.dimensions);
    }

    if (productData.production_time !== undefined) {
        updates.push(`production_time = $${params.length + 1}`);
        params.push(productData.production_time);
    }

    if (productData.category_id !== undefined) {
        updates.push(`category_id = $${params.length + 1}`);
        params.push(productData.category_id);
    }

    if (updates.length === 0) {
        callback(null, 0);
        return;
    }

    params.push(productData.code);

    const codeParameter = params.length;

    query(
        `UPDATE product
         SET ${updates.join(', ')}
         WHERE code = $${codeParameter}`,
        params,
        (err, result) => {

            if (err) {
                callback(err, null);
                return;
            }

            const changesDesc =
                `Product updated: ${updates.join(', ')}`;

            /*
             * Log product change
             */
            query(
                `INSERT INTO "change"
                    (
                        date_and_time,
                        product_code,
                        changes
                    )
                 VALUES
                    (NOW(), $1, $2)`,
                [
                    productData.code,
                    changesDesc
                ],
                (err) => {

                    if (err) {
                        console.error(
                            'Error logging product update:',
                            err
                        );
                    }
                }
            );

            /*
             * Log who made the change
             */
            query(
                `INSERT INTO makes_change
                    (
                        personal_id,
                        change_date_time,
                        product_code
                    )
                 VALUES
                    ($1, NOW(), $2)`,
                [
                    personalId,
                    productData.code
                ],
                (err) => {

                    if (err) {
                        console.error(
                            'Error logging change maker:',
                            err
                        );
                    }
                }
            );

            /*
             * Images
             */
            if (
                productData.images &&
                Array.isArray(productData.images)
            ) {

                query(
                    `DELETE FROM image
                     WHERE product_code = $1`,
                    [productData.code],
                    (err) => {

                        if (err) {
                            console.error(
                                'Error deleting old images:',
                                err
                            );
                            return;
                        }

                        productData.images.forEach(
                            (image, index) => {

                                query(
                                    `INSERT INTO image
                                        (
                                            product_code,
                                            image_url,
                                            is_primary
                                        )
                                     VALUES
                                        ($1, $2, $3)`,
                                    [
                                        productData.code,
                                        image,
                                        index === 0
                                    ],
                                    (err) => {

                                        if (err) {
                                            console.error(
                                                'Error inserting image:',
                                                err
                                            );
                                        }
                                    }
                                );
                            }
                        );
                    }
                );
            }

            /*
             * Colors
             */
            if (
                productData.colors &&
                Array.isArray(productData.colors)
            ) {

                query(
                    `DELETE FROM color
                     WHERE product_code = $1`,
                    [productData.code],
                    (err) => {

                        if (err) {
                            console.error(
                                'Error deleting old colors:',
                                err
                            );
                            return;
                        }

                        productData.colors.forEach(color => {

                            query(
                                `INSERT INTO color
                                    (product_code, name)
                                 VALUES
                                    ($1, $2)`,
                                [
                                    productData.code,
                                    color
                                ],
                                (err) => {

                                    if (err) {
                                        console.error(
                                            'Error inserting color:',
                                            err
                                        );
                                    }
                                }
                            );
                        });
                    }
                );
            }

            callback(null, result.rowCount);
        }
    );
}


function deleteProduct(
    productCode,
    storeId,
    personalId,
    callback
) {

    pool.connect()
        .then(client => {

            return client.query('BEGIN')
                .then(() => {

                    return client.query(
                        `INSERT INTO "change"
                            (
                                date_and_time,
                                product_code,
                                changes
                            )
                         VALUES
                            (NOW(), $1, $2)`,
                        [
                            productCode,
                            'Product deleted'
                        ]
                    );
                })
                .then(() => {

                    return client.query(
                        `INSERT INTO makes_change
                            (
                                personal_id,
                                change_date_time,
                                product_code
                            )
                         VALUES
                            ($1, NOW(), $2)`,
                        [
                            personalId,
                            productCode
                        ]
                    );
                })
                .then(() => {

                    return client.query(
                        `DELETE FROM product
                         WHERE code = $1
                           AND store_id = $2`,
                        [
                            productCode,
                            storeId
                        ]
                    );
                })
                .then(result => {

                    return client.query('COMMIT')
                        .then(() => {

                            client.release();

                            callback(
                                null,
                                result.rowCount
                            );
                        });
                })
                .catch(err => {

                    return client.query('ROLLBACK')
                        .catch(() => {})
                        .then(() => {

                            client.release();
                            callback(err);
                        });
                });
        })
        .catch(err => {
            callback(err);
        });
}


/*
 * ============================================================
 * CATEGORY FUNCTIONS
 * ============================================================
 */

function getCategories(callback) {

    query(
        `SELECT *
         FROM category
         ORDER BY name`,
        [],
        (err, result) => {

            callback(
                err,
                result ? result.rows : []
            );
        }
    );
}


function getCategoriesWithParents(callback) {

    query(
        `SELECT
            c1.*,
            c2.name AS parent_name
         FROM category c1
         LEFT JOIN category c2
           ON c1.parent_category_id =
              c2.category_id
         ORDER BY c1.name`,
        [],
        (err, result) => {

            callback(
                err,
                result ? result.rows : []
            );
        }
    );
}


function createCategory(categoryData, callback) {

    query(
        `INSERT INTO category
            (
                name,
                description,
                parent_category_id
            )
         VALUES
            ($1, $2, $3)
         RETURNING category_id`,
        [
            categoryData.name,
            categoryData.description || null,
            categoryData.parent_id || null
        ],
        (err, result) => {

            if (err) {
                callback(err, null);
            } else {

                callback(null, {
                    id: result.rows[0].category_id,
                    name: categoryData.name,
                    parent_id: categoryData.parent_id,
                    description: categoryData.description
                });
            }
        }
    );
}


/*
 * ============================================================
 * STORE FUNCTIONS
 * ============================================================
 */

function getStores(callback) {

    query(
        `SELECT *
         FROM store
         ORDER BY name`,
        [],
        (err, result) => {

            callback(
                err,
                result ? result.rows : []
            );
        }
    );
}


function getStoreProducts(storeId, callback) {

    query(
        `SELECT
            p.*,
            c.name AS category_name
         FROM product p
         JOIN category c
           ON p.category_id = c.category_id
         WHERE p.store_id = $1
         ORDER BY p.code`,
        [storeId],
        (err, result) => {

            callback(
                err,
                result ? result.rows : []
            );
        }
    );
}


function getStoreOrders(storeId, callback) {

    query(
        `SELECT
            o.*,
            c.first_name,
            c.last_name
         FROM "order" o
         JOIN client c
           ON o.client_id = c.client_id
         WHERE o.store_id = $1
         ORDER BY o.order_date DESC`,
        [storeId],
        (err, result) => {

            if (err) {
                callback(err, null);
                return;
            }

            const orders = result.rows || [];

            if (orders.length === 0) {
                callback(null, []);
                return;
            }

            let completed = 0;

            orders.forEach(order => {

                query(
                    `SELECT
                        oi.*,
                        p.description
                     FROM order_items oi
                     JOIN product p
                       ON oi.product_code = p.code
                     WHERE oi.order_num = $1`,
                    [order.order_num],
                    (err, result) => {

                        if (!err) {
                            order.items =
                                result.rows || [];
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
    );
}


function getStoreEmployees(storeId, callback) {

    query(
        `SELECT
            p.*,
            e.date_of_hire,
            perm.type AS permission_type,
            perm.authorisation
         FROM personal p
         JOIN works_in_store w
           ON p.id = w.personal_id
         LEFT JOIN employees e
           ON p.id = e.employee_id
         LEFT JOIN permissions perm
           ON p.id = perm.personal_id
         WHERE w.store_id = $1`,
        [storeId],
        (err, result) => {

            callback(
                err,
                result ? result.rows : []
            );
        }
    );
}


function getStoreReports(storeId, callback) {

    query(
        `SELECT
            r.date,
            r.store_id,
            r.overall_profit,
            r.sales_trend,
            r.marketing_growth,
            r.owner_signature
         FROM report r
         WHERE r.store_id = $1
         ORDER BY r.date DESC`,
        [storeId],
        (err, result) => {
            callback(
                err,
                result ? result.rows : []
            );
        }
    );
}


function getStoreStats(storeId, callback) {

    const stats = {};

    query(
        `SELECT COUNT(DISTINCT se.product_code) AS total_products
         FROM sells se
         WHERE se.store_id = $1`,
        [storeId],
        (err, result) => {

            if (err) {
                callback(err, null);
                return;
            }

            stats.total_products = Number(
                result.rows[0]?.total_products || 0
            );

            query(
                `SELECT COUNT(DISTINCT o.order_num) AS total_orders
                 FROM sells se
                 JOIN includes i
                   ON i.product_code = se.product_code
                 JOIN "order" o
                   ON o.order_num = i.order_num
                 WHERE se.store_id = $1`,
                [storeId],
                (err, result) => {

                    if (err) {
                        callback(err, null);
                        return;
                    }

                    stats.total_orders = Number(
                        result.rows[0]?.total_orders || 0
                    );

                    query(
                        `SELECT
                            COALESCE(
                                SUM(
                                    p.price * i.quantity
                                    * (1 - COALESCE(o.discount, 0) / 100.0)
                                ),
                                0
                            ) AS total_revenue
                         FROM sells se
                         JOIN product p
                           ON p.code = se.product_code
                         JOIN includes i
                           ON i.product_code = se.product_code
                         JOIN "order" o
                           ON o.order_num = i.order_num
                         WHERE se.store_id = $1`,
                        [storeId],
                        (err, result) => {

                            if (err) {
                                callback(err, null);
                                return;
                            }

                            stats.total_revenue = Number(
                                result.rows[0]?.total_revenue || 0
                            );

                            query(
                                `WITH store_reviews AS (
                                    SELECT DISTINCT
                                        r.order_num,
                                        r.rating
                                    FROM review r
                                    JOIN includes i
                                      ON i.order_num = r.order_num
                                    JOIN sells se
                                      ON se.product_code = i.product_code
                                    WHERE se.store_id = $1
                                )
                                SELECT COALESCE(AVG(rating), 0) AS avg_rating
                                FROM store_reviews`,
                                [storeId],
                                (err, result) => {

                                    if (err) {
                                        callback(err, null);
                                        return;
                                    }

                                    stats.avg_rating = Number(
                                        result.rows[0]?.avg_rating || 0
                                    );

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


/*
 * ============================================================
 * ORDER FUNCTIONS
 * ============================================================
 */

function createOrderNew(orderData, callback) {

    pool.connect()
        .then(client => {

            return client.query('BEGIN')
                .then(() => {

                    return client.query(
                        `INSERT INTO "order"
                            (
                                order_num,
                                client_id,
                                order_date,
                                quantity,
                                payment_method,
                                discount,
                                delivery_address,
                                store_id
                            )
                         VALUES
                            (
                                $1,
                                $2,
                                NOW(),
                                $3,
                                $4,
                                $5,
                                $6,
                                $7
                            )`,
                        [
                            orderData.order_num,
                            orderData.client_id,
                            orderData.quantity,
                            orderData.payment_method,
                            orderData.discount,
                            orderData.delivery_address,
                            orderData.store_id
                        ]
                    );
                })
                .then(() => {

                    const items =
                        orderData.items || [];

                    if (items.length === 0) {
                        return client.query('COMMIT')
                            .then(() => {

                                client.release();

                                callback(
                                    null,
                                    orderData.order_num
                                );
                            });
                    }

                    return Promise.all(
                        items.map(item => {

                            return client.query(
                                `INSERT INTO order_items
                                    (
                                        order_num,
                                        product_code,
                                        quantity,
                                        price
                                    )
                                 VALUES
                                    ($1, $2, $3, $4)`,
                                [
                                    orderData.order_num,
                                    item.product_code,
                                    item.quantity,
                                    item.price
                                ]
                            );
                        })
                    )
                        .then(() => client.query('COMMIT'))
                        .then(() => {

                            client.release();

                            callback(
                                null,
                                orderData.order_num
                            );
                        });
                })
                .catch(err => {

                    return client.query('ROLLBACK')
                        .catch(() => {})
                        .then(() => {

                            client.release();
                            callback(err, null);
                        });
                });
        })
        .catch(err => {
            callback(err, null);
        });
}


function getOrdersByClient(clientId, callback) {

    query(
        `SELECT
            o.*,
            s.name AS store_name
         FROM "order" o
         JOIN store s
           ON o.store_id = s.store_id
         WHERE o.client_id = $1
         ORDER BY o.order_date DESC`,
        [clientId],
        (err, result) => {

            if (err) {
                callback(err, null);
                return;
            }

            const orders = result.rows || [];

            if (orders.length === 0) {
                callback(null, []);
                return;
            }

            let completed = 0;

            orders.forEach(order => {

                query(
                    `SELECT
                        oi.*,
                        p.description
                     FROM order_items oi
                     JOIN product p
                       ON oi.product_code = p.code
                     WHERE oi.order_num = $1`,
                    [order.order_num],
                    (err, result) => {

                        if (!err) {
                            order.items =
                                result.rows || [];
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
    );
}


function getAllOrders(callback) {

    query(
        `SELECT
            o.*,
            c.first_name,
            c.last_name,
            s.name AS store_name
         FROM "order" o
         JOIN client c
           ON o.client_id = c.client_id
         JOIN store s
           ON o.store_id = s.store_id
         ORDER BY o.order_date DESC`,
        [],
        (err, result) => {

            callback(
                err,
                result ? result.rows : []
            );
        }
    );
}


/*
 * ============================================================
 * REVIEW FUNCTIONS
 * ============================================================
 */

function createReviewNew(reviewData, callback) {

    const reviewId =
        'REV' +
        Date.now().toString().slice(-8);

    query(
        `INSERT INTO review
            (
                review_id,
                client_id,
                product_code,
                rating,
                comment,
                review_date
            )
         VALUES
            ($1, $2, $3, $4, $5, NOW())
         RETURNING review_id`,
        [
            reviewId,
            reviewData.client_id,
            reviewData.product_code,
            reviewData.rating,
            reviewData.comment || ''
        ],
        (err, result) => {

            if (err) {
                callback(err, null);
            } else {
                callback(
                    null,
                    result.rows[0].review_id
                );
            }
        }
    );
}


/*
 * ============================================================
 * REQUEST FUNCTIONS
 * ============================================================
 */

function createRequest(requestData, callback) {

    query(
        `INSERT INTO request
            (
                request_num,
                date_and_time,
                problem,
                client_id,
                store_id
            )
         VALUES
            ($1, $2, $3, $4, $5)`,
        [
            requestData.request_num,
            requestData.date_and_time,
            requestData.problem,
            requestData.client_id,
            requestData.store_id
        ],
        (err) => {

            if (err) {
                callback(err, null);
            } else {
                callback(
                    null,
                    requestData.request_num
                );
            }
        }
    );
}


/*
 * ============================================================
 * REFUND FUNCTIONS
 * ============================================================
 */

function createRefund(refundData, callback) {

    query(
        `INSERT INTO refund
            (
                refund_id,
                order_num,
                amount,
                reason,
                request_date
            )
         VALUES
            ($1, $2, $3, $4, NOW())`,
        [
            refundData.refund_id,
            refundData.order_num,
            refundData.amount,
            refundData.reason
        ],
        (err) => {

            if (err) {
                callback(err, null);
            } else {
                callback(
                    null,
                    refundData.refund_id
                );
            }
        }
    );
}


/*
 * ============================================================
 * EMPLOYEE TASKS
 * ============================================================
 */

function getEmployeeTasks(
    personalId,
    storeId,
    callback
) {

    const tasks = {
        pending_orders: [],
        pending_requests: [],
        pending_refunds: []
    };

    /*
     * Pending orders
     */
    query(
        `SELECT
            o.*,
            c.first_name,
            c.last_name
         FROM "order" o
         JOIN client c
           ON o.client_id = c.client_id
         WHERE o.store_id = $1
           AND o.status = $2
         ORDER BY o.order_date ASC`,
        [
            storeId,
            'pending'
        ],
        (err, result) => {

            if (!err) {
                tasks.pending_orders =
                    result.rows || [];
            }

            /*
             * Pending requests
             */
            query(
                `SELECT
                    r.*,
                    c.first_name,
                    c.last_name
                 FROM request r
                 JOIN client c
                   ON r.client_id = c.client_id
                 WHERE r.store_id = $1
                   AND r.status = $2
                 ORDER BY r.date_and_time ASC`,
                [
                    storeId,
                    'pending'
                ],
                (err, result) => {

                    if (!err) {
                        tasks.pending_requests =
                            result.rows || [];
                    }

                    /*
                     * Pending refunds
                     */
                    query(
                        `SELECT
                            rf.*,
                            o.client_id,
                            c.first_name,
                            c.last_name
                         FROM refund rf
                         JOIN "order" o
                           ON rf.order_num =
                              o.order_num
                         JOIN client c
                           ON o.client_id =
                              c.client_id
                         WHERE o.store_id = $1
                           AND rf.status = $2
                         ORDER BY rf.request_date ASC`,
                        [
                            storeId,
                            'pending'
                        ],
                        (err, result) => {

                            if (!err) {
                                tasks.pending_refunds =
                                    result.rows || [];
                            }

                            callback(
                                null,
                                tasks
                            );
                        }
                    );
                }
            );
        }
    );
}


/*
 * ============================================================
 * CLIENT STATISTICS
 * ============================================================
 */

function getClientStats(clientId, callback) {

    const stats = {};

    query(
        `SELECT COUNT(*) AS total_orders
         FROM "order"
         WHERE client_id = $1`,
        [clientId],
        (err, result) => {

            if (err) {
                callback(err, null);
                return;
            }

            stats.total_orders =
                Number(
                    result.rows[0]
                        ? result.rows[0].total_orders
                        : 0
                );

            query(
                `SELECT
                    COALESCE(
                        SUM(
                            oi.price * oi.quantity
                        ),
                        0
                    ) AS total_spent
                 FROM order_items oi
                 JOIN "order" o
                   ON oi.order_num = o.order_num
                 WHERE o.client_id = $1`,
                [clientId],
                (err, result) => {

                    if (err) {
                        callback(err, null);
                        return;
                    }

                    stats.total_spent =
                        Number(
                            result.rows[0]
                                ? result.rows[0].total_spent
                                : 0
                        );

                    query(
                        `SELECT COUNT(*) AS pending_orders
                         FROM "order"
                         WHERE client_id = $1
                           AND status = $2`,
                        [
                            clientId,
                            'pending'
                        ],
                        (err, result) => {

                            if (err) {
                                callback(err, null);
                                return;
                            }

                            stats.pending_orders =
                                Number(
                                    result.rows[0]
                                        ? result.rows[0]
                                            .pending_orders
                                        : 0
                                );

                            query(
                                `SELECT
                                    COUNT(*) AS delivered_orders
                                 FROM "order"
                                 WHERE client_id = $1
                                   AND status = $2`,
                                [
                                    clientId,
                                    'delivered'
                                ],
                                (err, result) => {

                                    if (err) {
                                        callback(err, null);
                                        return;
                                    }

                                    stats.delivered_orders =
                                        Number(
                                            result.rows[0]
                                                ? result.rows[0]
                                                    .delivered_orders
                                                : 0
                                        );

                                    callback(
                                        null,
                                        stats
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


/*
 * ============================================================
 * ADMIN USER FUNCTIONS
 * ============================================================
 */

function getAllUsers(callback) {

    query(
        `SELECT
            client_id AS id,
            first_name,
            last_name,
            email,
            'client' AS user_type,
            NULL AS username,
            5 AS role_priority
         FROM client
         ORDER BY client_id`,
        [],
        (err, result) => {

            if (err) {
                callback(err, null);
                return;
            }

            const usersMap = new Map();

            result.rows.forEach(row => {
                usersMap.set(row.id, row);
            });

            /*
             * Personal users
             */
            query(
                `SELECT
                    p.id,
                    p.first_name,
                    p.last_name,
                    p.email,
                    CASE
                        WHEN b.boss_id IS NOT NULL
                            THEN 'store_owner'
                        ELSE 'store_employee'
                    END AS user_type,
                    NULL AS username,
                    CASE
                        WHEN b.boss_id IS NOT NULL
                            THEN 2
                        ELSE 4
                    END AS role_priority
                 FROM personal p
                 LEFT JOIN boss b
                   ON p.id = b.boss_id
                 LEFT JOIN employees e
                   ON p.id = e.employee_id
                 WHERE b.boss_id IS NOT NULL
                    OR e.employee_id IS NOT NULL
                 ORDER BY p.id`,
                [],
                (err, result) => {

                    if (err) {
                        callback(err, null);
                        return;
                    }

                    result.rows.forEach(row => {

                        const existing =
                            usersMap.get(row.id);

                        if (
                            !existing ||
                            (
                                existing.role_priority &&
                                row.role_priority <
                                existing.role_priority
                            )
                        ) {
                            usersMap.set(
                                row.id,
                                row
                            );
                        }
                    });

                    /*
                     * System users
                     */
                    query(
                        `SELECT
                            id,
                            username,
                            email,
                            user_type,
                            CASE
                                WHEN user_type = 'admin'
                                    THEN 1
                                ELSE 3
                            END AS role_priority
                         FROM users
                         ORDER BY id`,
                        [],
                        (err, result) => {

                            if (err) {
                                callback(err, null);
                                return;
                            }

                            result.rows.forEach(row => {

                                const existing =
                                    usersMap.get(row.id);

                                if (
                                    !existing ||
                                    (
                                        existing.role_priority &&
                                        row.role_priority <
                                        existing.role_priority
                                    )
                                ) {

                                    const userData = {
                                        id: row.id,
                                        username: row.username,
                                        email: row.email,
                                        user_type: row.user_type,
                                        role_priority: row.role_priority
                                    };

                                    if (
                                        row.user_type ===
                                        'admin'
                                    ) {
                                        userData.first_name =
                                            'Admin';

                                        userData.last_name =
                                            'User';
                                    }

                                    usersMap.set(
                                        row.id,
                                        userData
                                    );
                                }
                            });

                            const users =
                                Array.from(
                                    usersMap.values()
                                ).map(user => {

                                    const {
                                        role_priority,
                                        ...userWithoutPriority
                                    } = user;

                                    return userWithoutPriority;
                                });

                            callback(
                                null,
                                users
                            );
                        }
                    );
                }
            );
        }
    );
}


/*
 * ============================================================
 * AUDIT LOG
 * ============================================================
 */

function logAudit(
    userId,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress
) {

    query(
        `INSERT INTO audit_log
            (
                user_id,
                action,
                resource_type,
                resource_id,
                details,
                ip_address
            )
         VALUES
            ($1, $2, $3, $4, $5, $6)`,
        [
            userId,
            action,
            resourceType,
            resourceId,
            details,
            ipAddress
        ],
        (err) => {

            if (err) {
                console.error(
                    'Error logging audit:',
                    err
                );
            }
        }
    );
}




/*
 * ============================================================
 * ADVANCED REPORTS
 * ============================================================
 */


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
    ORDER BY order_total DESC, o.order_num;
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
    ORDER BY number_of_orders DESC, total_quantity_sold DESC, total_revenue DESC;
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
    ORDER BY number_of_orders DESC, total_quantity_sold DESC, current_stock ASC;
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
    ORDER BY year DESC, month DESC, total_revenue DESC;
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
    ORDER BY total_revenue DESC, s.store_id;
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
    ORDER BY number_of_orders DESC, p.code;
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
    ORDER BY average_review DESC, s.store_id;
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
    ORDER BY revenue_growth DESC, store_id
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
    ORDER BY number_of_orders DESC, c.client_id;
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
    ORDER BY total_requests DESC, s.store_id;
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
    ORDER BY number_of_requests DESC, e.employee_id
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
    ORDER BY total_hours_worked DESC, total_pay DESC, e.employee_id;
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
    ORDER BY average_pay DESC, s.store_id;
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
    ORDER BY number_of_product_changes DESC, e.employee_id;
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
    ORDER BY month_date DESC, monthly_profit DESC, store_id;
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

function installReportFunctions(callback) {

    pool.query(REPORT_FUNCTIONS_SQL)
        .then(() => {
            console.log('✅ PostgreSQL report functions installed');
            if (callback) callback(null);
        })
        .catch(err => {
            console.error('❌ Failed to install PostgreSQL report functions:', err);
            if (callback) callback(err);
        });
}

const REPORT_FUNCTION_NAMES = new Set([
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

function runReport(reportName, params, callback) {

    if (!REPORT_FUNCTION_NAMES.has(reportName)) {
        callback(new Error('Unknown report: ' + reportName), null);
        return;
    }

    const values = Array.isArray(params) ? params : [];

    const placeholders = values.map(
        (_, index) => '$' + (index + 1)
    ).join(', ');

    query(
        `SELECT * FROM ${reportName}(${placeholders})`,
        values,
        (err, result) => {
            callback(
                err,
                result ? result.rows : []
            );
        }
    );
}

function generateStoreReport(
    storeId,
    startDate,
    endDate,
    type,
    period,
    ownerSignature,
    callback
) {

    query(
        `WITH sales AS (
            SELECT
                COALESCE(
                    SUM(
                        p.price * i.quantity
                        * (1 - COALESCE(o.discount, 0) / 100.0)
                    ),
                    0
                ) AS revenue
            FROM sells se
            JOIN product p
              ON p.code = se.product_code
            JOIN includes i
              ON i.product_code = se.product_code
            JOIN "order" o
              ON o.order_num = i.order_num
            WHERE se.store_id = $1
              AND o.last_date_mod >= $2::timestamp
              AND o.last_date_mod < ($3::timestamp + INTERVAL '1 day')
        ),
        refunds AS (
            SELECT
                COALESCE(SUM(rf.amount), 0) AS refund_total
            FROM refund rf
            JOIN "order" o
              ON o.order_num = rf.order_num
            WHERE LEFT(o.order_num, 3) = $1
              AND o.last_date_mod >= $2::timestamp
              AND o.last_date_mod < ($3::timestamp + INTERVAL '1 day')
              AND rf.status IN ('approved', 'processed')
        )
        SELECT
            sales.revenue,
            refunds.refund_total,
            sales.revenue - refunds.refund_total AS net_profit
        FROM sales CROSS JOIN refunds`,
        [storeId, startDate, endDate],
        (err, result) => {

            if (err) {
                callback(err, null);
                return;
            }

            const row = result.rows[0] || {};
            const revenue = Number(row.revenue || 0);
            const refundTotal = Number(row.refund_total || 0);
            const netProfit = Number(row.net_profit || 0);

            const salesTrend =
                `Revenue ${revenue.toFixed(2)}; Refunds ${refundTotal.toFixed(2)}`;

            query(
                `SELECT
                    COALESCE(SUM(
                        p.price * i.quantity
                        * (1 - COALESCE(o.discount, 0) / 100.0)
                    ), 0) AS revenue
                 FROM sells se
                 JOIN product p
                   ON p.code = se.product_code
                 JOIN includes i
                   ON i.product_code = se.product_code
                 JOIN "order" o
                   ON o.order_num = i.order_num
                 WHERE se.store_id = $1
                   AND o.last_date_mod >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
                   AND o.last_date_mod < DATE_TRUNC('month', CURRENT_DATE)`,
                [storeId],
                (previousErr, previousResult) => {

                    if (previousErr) {
                        callback(previousErr, null);
                        return;
                    }

                    const previousRevenue =
                        Number(previousResult.rows[0]?.revenue || 0);

                    const growth =
                        previousRevenue === 0
                            ? (revenue > 0 ? 100 : 0)
                            : ((revenue - previousRevenue) / previousRevenue) * 100;

                    const marketingGrowth =
                        `${growth.toFixed(2)}%`;

                    query(
                        `INSERT INTO report
                            (
                                date,
                                store_id,
                                overall_profit,
                                sales_trend,
                                marketing_growth,
                                owner_signature
                            )
                         VALUES
                            (
                                CURRENT_TIMESTAMP,
                                $1,
                                $2,
                                $3,
                                $4,
                                $5
                            )
                         RETURNING
                            date,
                            store_id,
                            overall_profit,
                            sales_trend,
                            marketing_growth,
                            owner_signature`,
                        [
                            storeId,
                            Math.max(0, netProfit),
                            salesTrend.slice(0, 100),
                            marketingGrowth.slice(0, 100),
                            ownerSignature || 'Not signed yet'
                        ],
                        (insertErr, insertResult) => {

                            if (insertErr) {
                                callback(insertErr, null);
                                return;
                            }

                            const report = insertResult.rows[0];

                            /*
                             * monthly_profit has a composite primary key of
                             * (report_date, store_id), so it can contain one
                             * summary row per generated report without changing
                             * the project database structure.
                             */
                            query(
                                `INSERT INTO monthly_profit
                                    (
                                        report_date,
                                        store_id,
                                        month_and_year,
                                        profit
                                    )
                                 VALUES
                                    (
                                        $1,
                                        $2,
                                        DATE_TRUNC('month', $3::timestamp)::DATE,
                                        $4
                                    )
                                 ON CONFLICT (report_date, store_id)
                                 DO UPDATE SET
                                    month_and_year = EXCLUDED.month_and_year,
                                    profit = EXCLUDED.profit`,
                                [
                                    report.date,
                                    storeId,
                                    endDate,
                                    Math.max(0, netProfit)
                                ],
                                (monthlyErr) => {

                                    if (monthlyErr) {
                                        console.error(
                                            'Warning inserting monthly profit:',
                                            monthlyErr
                                        );
                                    }

                                    query(
                                        `INSERT INTO exchanges_data
                                            (
                                                report_date,
                                                store_id,
                                                monthly_profit,
                                                date,
                                                sales,
                                                damages
                                            )
                                         VALUES
                                            (
                                                $1,
                                                $2,
                                                $3,
                                                CURRENT_TIMESTAMP,
                                                $4,
                                                $5
                                            )
                                         ON CONFLICT (report_date, store_id)
                                         DO UPDATE SET
                                            monthly_profit = EXCLUDED.monthly_profit,
                                            date = EXCLUDED.date,
                                            sales = EXCLUDED.sales,
                                            damages = EXCLUDED.damages`,
                                        [
                                            report.date,
                                            storeId,
                                            Math.max(0, netProfit),
                                            revenue,
                                            -refundTotal
                                        ],
                                        (exchangeErr) => {

                                            if (exchangeErr) {
                                                console.error(
                                                    'Warning inserting exchange data:',
                                                    exchangeErr
                                                );
                                            }

                                            callback(
                                                null,
                                                report
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
}
/*
 * ============================================================
 * EXPORTS
 * ============================================================
 */

module.exports = {

    pool,

    query,

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

    installReportFunctions,
    runReport,
    generateStoreReport,

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