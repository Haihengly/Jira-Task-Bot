const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/mappings.sqlite');

// Ensure the data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite Database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log(`Connected to the SQLite database at ${dbPath}`);
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        const schema = `
            CREATE TABLE IF NOT EXISTS users (
                telegram_user_id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                jira_account_id TEXT NOT NULL,
                jira_email TEXT NOT NULL,
                display_name TEXT,
                registered_at TEXT
            );
        `;
        db.run(schema, (err) => {
            if (err) {
                console.error('Error creating schema:', err.message);
            } else {
                console.log('Database schema initialized.');
            }
        });

        // Adding columns safely for existing databases
        db.run(`ALTER TABLE users ADD COLUMN registered_at TEXT`, (errAlter) => {
            if (errAlter) {
                if (!errAlter.message.includes('duplicate column name')) {
                    console.error('Error adding registered_at column:', errAlter.message);
                }
            } else {
                console.log('Added registered_at column to users table.');
            }
        });

        db.run(`ALTER TABLE users ADD COLUMN display_name TEXT`, (errAlter) => {
            if (errAlter) {
                if (!errAlter.message.includes('duplicate column name')) {
                    console.error('Error adding display_name column:', errAlter.message);
                }
            } else {
                console.log('Added display_name column to users table.');
            }
        });
    });
}

module.exports = db;
