# Jira Telegram Bot

A 1-on-1 Telegram bot that integrates with Jira Cloud for staff task tracking and automated notifications.

## Project Overview
This project assists team members in tracking Jira tasks directly from Telegram. 
- **Core Functionality**: Register Jira accounts, view assigned tasks, and handle assignment notifications.
- **Microservices**: Orchestrated as separate services:
  - `bot/`: Telegram bot polling for commands and a Webhook listener for real-time Jira updates.
  - `cron-service/`: A scheduled service querying Jira for daily task summaries.
- **Persistence**: SQLite (local storage) with Docker bind-mounts.

---

## Setup & Running

### 1. Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose.
- A Jira Cloud account with API token access.
- A Telegram Bot Token from [@BotFather](https://t.me/botfather).

### 2. Configuration
Copy the example environment file and fill in required variables:
```bash
cp .env.example .env
# Edit .env and enter your JIRA_EMAIL, JIRA_API_TOKEN, TELEGRAM_BOT_TOKEN, etc.
```

### 3. Data Persistence (One-time)
Create the data directory and set correct permissions for the Docker user (UID 1000):
```bash
mkdir -p ./bot-data
sudo chown -R 1000:1000 ./bot-data
```

### 4. Running the Bot
Build and launch all services (bot, cron-service, and ngrok for webhook exposition):
```bash
docker compose up -d --build
```

---

## Telegram Commands
| Command | Description |
| :--- | :--- |
| `/register <email>` | Link your Telegram account to your Jira account. |
| `/myaccount` | Show linked account info and task counts. |
| `/todo` | List "To Do" tasks (sorted by urgency). |
| `/inprogress` | List "In Progress" tasks (sorted by urgency). |
| `/done` | List "Done" tasks (alphabetical). |
| `/help` | Display all available commands and usage. |

---

## Development & Deployment

### Local Development
The bot uses Express to handle `POST /webhook/jira` requests from Jira for real-time assignment notifications. `ngrok` is included in `docker-compose.yml` to expose your local instance. Access http://localhost:4040 to inspect traffic.

### Automated Reminders
The `cron-service` automatically sends daily reminders. These are pre-configured to run at **8:00 AM** in the **Asia/Phnom_Penh** timezone.
- Adjust the schedule via `CRON_SCHEDULE` (cron expression) and `CRON_TIMEZONE` in your `.env`.

---

## Project Structure
```
jira-telegram-bot/
├── bot/                    # Telegram bot & Webhook server
├── cron-service/           # Scheduled reminder service
├── bot-data/               # Persistent DB storage (UID 1000)
├── docker-compose.yml      # Multi-service orchestration
├── Dockerfile.bot          # Bot container definition
└── Dockerfile.cron-service # Cron service container definition
```
