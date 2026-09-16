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
    const schema = `
        CREATE TABLE IF NOT EXISTS users (
            telegram_user_id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            jira_account_id TEXT NOT NULL,
            jira_email TEXT NOT NULL
        );
    `;
    db.run(schema, (err) => {
        if (err) {
            console.error('Error creating schema:', err.message);
        } else {
            console.log('Database schema initialized.');
        }
    });
}

module.exports = db;
