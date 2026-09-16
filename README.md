# Jira Telegram Bot (Phase 1)

A 1-on-1 Telegram bot that integrates with Jira Cloud to let staff view and manage their tasks.

## Features (Phase 1)
- `/register <jira_email>`: Maps your Telegram account to your Jira account via email lookup.
- `/todo`: Lists all your assigned Jira issues with status **"To Do"**.
- `/inprogress`: Lists all your assigned Jira issues with status **"In Progress"**.
- `/done`: Lists all your assigned Jira issues with status **"Done"**.

---

## Setup & Running Locally

### 1. Prerequisites
- Node.js >= 18.0.0
- A Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- A Jira Cloud API Token (generated from [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens))

### 2. Installation
Install project dependencies:
```bash
npm install
```

### 3. Environment Variables
Create or verify your `.env` file based on `.env.example`:
```env
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_BASE_URL=https://your-domain.atlassian.net
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
DB_PATH=./data/mappings.sqlite
```

### 4. Running the Bot
Start the bot locally in polling mode:
```bash
npm start
```

---

## Running with Docker / Docker Compose

### 1. Host Setup (One-time)
Create the data directory and ensure the container's user (UID 1000) has permission to write to it:
```bash
mkdir -p ./bot-data
sudo chown -R 1000:1000 ./bot-data
```

### 2. Build and Start
Build the image and start the bot container in detached mode:
```bash
docker compose up -d --build
```

### 3. View Logs
Follow the live application output to ensure the bot connected:
```bash
docker compose logs -f
```

### 4. Stop the Bot
Stop the running containers:
```bash
docker compose down
```
*(Note: Data is saved to the local `./bot-data` bind mount and persists across container rebuilds/restarts.)*

---

## Project Structure
```
jira-telegram-bot/
├── src/
│   ├── bot.js              # Telegraf setup, registers command handlers
│   ├── commands/
│   │   ├── register.js     # /register logic
│   │   └── tasks.js        # /todo, /inprogress, /done — shared task handler
│   ├── jira/
│   │   └── client.js       # Jira Cloud API client (Basic Auth, Search endpoints)
│   ├── db/
│   │   ├── db.js           # SQLite setup & schema initialization
│   │   └── mappings.js     # User mapping persistence
│   └── index.js            # Entry point
├── data/                   # SQLite database storage (gitignored)
├── .env                    # Secrets and configuration (gitignored)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```
