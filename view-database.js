const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'handcraft.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
});

console.log('\n🎨 HANDCRAFT MARKETPLACE - DATABASE CONTENTS\n');

// Helper function to format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) ? date.toString() : dateString;
}

// Helper function to check if table exists
function tableExists(tableName, callback) {
    db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
        [tableName],
        (err, row) => {
            callback(!err && row);
        }
    );
}

// Main execution chain
function executeChecks() {
    let currentCheck = 0;

    const checks = [
        { name: 'clients', func: checkClients },
        { name: 'personal', func: checkPersonal },
        { name: 'store', func: checkStore },
        { name: 'product', func: checkProduct },
        { name: 'category', func: checkCategory },
        { name: 'works_in_store', func: checkWorksInStore },
        { name: 'permissions', func: checkPermissions },
        { name: 'employees', func: checkEmployees },
        { name: 'boss', func: checkBoss },
        { name: 'order', func: checkOrder },
        { name: 'report', func: checkReport },
        { name: 'refund', func: checkRefund },
        { name: 'image', func: checkImage },
        { name: 'color', func: checkColor }
    ];

    function next() {
        currentCheck++;
        if (currentCheck < checks.length) {
            checks[currentCheck].func(next);
        } else {
            finish();
        }
    }

    // Start with first check
    checks[0].func(next);
}

// Display CLIENTS table
function checkClients(next) {
    console.log('\n👤 CLIENTS TABLE:');
    console.log('================================================================================');

    tableExists('client', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all('SELECT * FROM client', [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No clients found\n');
            } else {
                console.log(`Total: ${rows.length} clients\n`);
                rows.forEach((client, index) => {
                    console.log(`ID: ${client.client_id} | Name: ${client.first_name || ''} ${client.last_name || ''}`);
                    console.log(`Email: ${client.email || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log(); // Add blank line after table
            }
            if (next) next();
        });
    });
}

// Display PERSONAL table
function checkPersonal(next) {
    console.log('\n👔 PERSONAL TABLE (STORE OWNERS/EMPLOYEES):');
    console.log('================================================================================');

    tableExists('personal', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all(`
            SELECT p.*, 
                   CASE WHEN b.boss_id IS NOT NULL THEN 'BOSS' 
                        WHEN e.employee_id IS NOT NULL THEN 'EMPLOYEE' 
                        ELSE 'PERSONAL' END as role
            FROM personal p
            LEFT JOIN boss b ON p.id = b.boss_id
            LEFT JOIN employees e ON p.id = e.employee_id
        `, [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No personal records found\n');
            } else {
                console.log(`Total: ${rows.length} personal records\n`);
                rows.forEach((person, index) => {
                    console.log(`ID: ${person.id || 'N/A'} | Name: ${person.first_name || ''} ${person.last_name || ''} | Role: ${person.role || 'N/A'}`);
                    console.log(`Email: ${person.email || 'N/A'} | SSN: ${person.ssn || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display STORE table
function checkStore(next) {
    console.log('\n🏪 STORE TABLE:');
    console.log('================================================================================');

    tableExists('store', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all('SELECT * FROM store', [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No stores found\n');
            } else {
                console.log(`Total: ${rows.length} stores\n`);
                rows.forEach((store, index) => {
                    console.log(`ID: ${store.store_id || 'N/A'} | Name: ${store.name || 'N/A'}`);
                    console.log(`Email: ${store.store_email || 'N/A'} | Rating: ${store.rating || '0.0'}`);
                    console.log(`Address: ${store.physical_address || 'N/A'}`);
                    console.log(`Founded: ${formatDate(store.date_of_founding)}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display PRODUCT table
function checkProduct(next) {
    console.log('\n🛍️ PRODUCT TABLE:');
    console.log('================================================================================');

    tableExists('product', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all(`
            SELECT p.*, c.name as category_name 
            FROM product p 
            LEFT JOIN category c ON p.category_id = c.category_id
        `, [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No products found\n');
            } else {
                console.log(`Total: ${rows.length} products\n`);
                rows.forEach((product, index) => {
                    console.log(`Code: ${product.code || 'N/A'} | Price: $${product.price || '0.00'}`);
                    console.log(`Description: ${product.description ? product.description.substring(0, 50) + (product.description.length > 50 ? '...' : '') : 'N/A'}`);
                    console.log(`Store ID: ${product.store_id || 'N/A'} | Category: ${product.category_name || 'N/A'}`);
                    console.log(`Available: ${product.availability || '0'} | Weight: ${product.weight || '0'}kg`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display CATEGORY table
function checkCategory(next) {
    console.log('\n📁 CATEGORY TABLE:');
    console.log('================================================================================');

    tableExists('category', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all(`
            SELECT c1.*, c2.name as parent_name 
            FROM category c1 
            LEFT JOIN category c2 ON c1.parent_category_id = c2.category_id
        `, [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No categories found\n');
            } else {
                console.log(`Total: ${rows.length} categories\n`);
                rows.forEach((cat, index) => {
                    console.log(`ID: ${cat.category_id || 'N/A'} | Name: ${cat.name || 'N/A'}`);
                    console.log(`Parent ID: ${cat.parent_category_id || 'None'} | Parent Name: ${cat.parent_name || 'None'}`);
                    console.log(`Description: ${cat.description || 'No description'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display WORKS_IN_STORE table
function checkWorksInStore(next) {
    console.log('\n🔗 WORKS_IN_STORE TABLE:');
    console.log('================================================================================');

    tableExists('works_in_store', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all(`
            SELECT w.*, p.first_name, p.last_name, s.name as store_name
            FROM works_in_store w
            LEFT JOIN personal p ON w.personal_id = p.id
            LEFT JOIN store s ON w.store_id = s.store_id
        `, [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No assignments found\n');
            } else {
                console.log(`Total: ${rows.length} assignments\n`);
                rows.forEach((assign, index) => {
                    console.log(`Personal ID: ${assign.personal_id || 'N/A'} | Store ID: ${assign.store_id || 'N/A'}`);
                    console.log(`Name: ${assign.first_name || ''} ${assign.last_name || ''} | Store: ${assign.store_name || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display PERMISSIONS table
function checkPermissions(next) {
    console.log('\n🔐 PERMISSIONS TABLE:');
    console.log('================================================================================');

    tableExists('permissions', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all(`
            SELECT perm.*, p.first_name, p.last_name
            FROM permissions perm
            LEFT JOIN personal p ON perm.personal_id = p.id
        `, [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No permissions found\n');
            } else {
                console.log(`Total: ${rows.length} permissions\n`);
                rows.forEach((perm, index) => {
                    console.log(`Personal ID: ${perm.personal_id || 'N/A'} | Name: ${perm.first_name || ''} ${perm.last_name || ''}`);
                    console.log(`Type: ${perm.type || 'N/A'} | Authorization: ${perm.authorisation || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display EMPLOYEES table
function checkEmployees(next) {
    console.log('\n👷 EMPLOYEES TABLE:');
    console.log('================================================================================');

    tableExists('employees', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all(`
            SELECT e.*, p.first_name, p.last_name, p.email
            FROM employees e
            LEFT JOIN personal p ON e.employee_id = p.id
        `, [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No employees found\n');
            } else {
                console.log(`Total: ${rows.length} employees\n`);
                rows.forEach((emp, index) => {
                    console.log(`Employee ID: ${emp.employee_id || 'N/A'} | Name: ${emp.first_name || ''} ${emp.last_name || ''}`);
                    console.log(`Email: ${emp.email || 'N/A'} | Date Hired: ${formatDate(emp.date_of_hire)}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display BOSS table
function checkBoss(next) {
    console.log('\n👑 BOSS TABLE:');
    console.log('================================================================================');

    tableExists('boss', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all(`
            SELECT b.*, p.first_name, p.last_name, p.email
            FROM boss b
            LEFT JOIN personal p ON b.boss_id = p.id
        `, [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No bosses found\n');
            } else {
                console.log(`Total: ${rows.length} bosses\n`);
                rows.forEach((boss, index) => {
                    console.log(`Boss ID: ${boss.boss_id || 'N/A'} | Name: ${boss.first_name || ''} ${boss.last_name || ''}`);
                    console.log(`Email: ${boss.email || 'N/A'} | Signature: ${boss.signature || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display ORDER table
function checkOrder(next) {
    console.log('\n📦 ORDERS TABLE:');
    console.log('================================================================================');

    tableExists('order', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all(`
            SELECT o.*, c.first_name, c.last_name, s.name as store_name
            FROM "order" o
            LEFT JOIN client c ON o.client_id = c.client_id
            LEFT JOIN store s ON o.store_id = s.store_id
        `, [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No orders found\n');
            } else {
                console.log(`Total: ${rows.length} orders\n`);
                rows.forEach((order, index) => {
                    console.log(`Order #: ${order.order_num || 'N/A'} | Client: ${order.first_name || ''} ${order.last_name || ''}`);
                    console.log(`Store: ${order.store_name || 'N/A'} | Date: ${formatDate(order.order_date)}`);
                    console.log(`Status: ${order.status || 'N/A'} | Payment: ${order.payment_method || 'N/A'}`);
                    console.log(`Delivery: ${order.delivery_address ? order.delivery_address.substring(0, 30) + '...' : 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display REPORT table
function checkReport(next) {
    console.log('\n📊 REPORTS TABLE:');
    console.log('================================================================================');

    tableExists('report', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all('SELECT * FROM report', [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No reports found\n');
            } else {
                console.log(`Total: ${rows.length} reports\n`);
                rows.forEach((report, index) => {
                    console.log(`Report Date: ${formatDate(report.date)} | Store ID: ${report.store_id || 'N/A'}`);
                    console.log(`Profit: $${report.overall_profit || '0.00'} | Signature: ${report.owner_signature || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display REFUND table
function checkRefund(next) {
    console.log('\n💰 REFUND TABLE:');
    console.log('================================================================================');

    tableExists('refund', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all('SELECT * FROM refund', [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No refunds found\n');
            } else {
                console.log(`Total: ${rows.length} refunds\n`);
                rows.forEach((refund, index) => {
                    console.log(`Refund ID: ${refund.refund_id || 'N/A'} | Order: ${refund.order_num || 'N/A'}`);
                    console.log(`Amount: $${refund.amount || '0.00'} | Status: ${refund.status || 'N/A'}`);
                    console.log(`Reason: ${refund.reason || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display IMAGE table
function checkImage(next) {
    console.log('\n🖼️ IMAGE TABLE:');
    console.log('================================================================================');

    tableExists('image', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all('SELECT * FROM image', [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No images found\n');
            } else {
                console.log(`Total: ${rows.length} images\n`);
                rows.forEach((image, index) => {
                    console.log(`Product Code: ${image.product_code || 'N/A'} | Image: ${image.image || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Display COLOR table
function checkColor(next) {
    console.log('\n🎨 COLOR TABLE:');
    console.log('================================================================================');

    tableExists('color', (exists) => {
        if (!exists) {
            console.log('Table does not exist\n');
            if (next) next();
            return;
        }

        db.all('SELECT * FROM color', [], (err, rows) => {
            if (err) {
                console.log(`Error: ${err.message}\n`);
                if (next) next();
                return;
            }

            if (!rows || rows.length === 0) {
                console.log('No colors found\n');
            } else {
                console.log(`Total: ${rows.length} colors\n`);
                rows.forEach((color, index) => {
                    console.log(`Product Code: ${color.product_code || 'N/A'} | Color: ${color.color || 'N/A'}`);
                    if (index < rows.length - 1) console.log('-'.repeat(80));
                });
                console.log();
            }
            if (next) next();
        });
    });
}

// Finish and close database
function finish() {
    console.log('='.repeat(80));
    console.log('✅ Database inspection complete');
    console.log('='.repeat(80) + '\n');

    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        }
    });
}

// Start the execution chain
executeChecks();