# CLAUDE.md

## Project Overview
A 1-on-1 Telegram bot that integrates with Jira Cloud for staff task tracking.
- **Runtime & Frameworks**: Node.js, Telegraf (Telegram Bot library), Axios (Jira API), SQLite3 (storage), Dotenv.
- **Deployment**: Docker & Docker Compose (`node:20-alpine`, non-root user `node` UID 1000).
- **Database**: SQLite, mapping `telegram_user_id`, `chat_id`, `jira_account_id`, and `jira_email`.
  - Persisted locally via bind mount `./bot-data:/app/data` (or `./data` for local runs).
  - Host folder must be owned by UID/GID 1000 (`sudo chown -R 1000:1000 ./bot-data`) to prevent `SQLITE_CANTOPEN` errors.

---

## Git Rules
- **Do NOT push** to remote repositories (`git push`). The user will handle pushes manually.
- Commits are only made when requested.

---

## Project Structure
```
jira-telegram-bot/
├── src/
│   ├── bot.js              # Telegraf setup, registers command handlers & fallback
│   ├── commands/
│   │   ├── help.js         # /help and start message definitions
│   │   ├── register.js     # /register logic (Jira user lookup + DB mapping)
│   │   └── tasks.js        # /todo, /inprogress, /done (urgency sorting & Khmer formatting)
│   ├── jira/
│   │   └── client.js       # Isolated Jira API client (with dynamic fields param)
│   ├── db/
│   │   └── db.js           # SQLite connection & schema initialization
│   │   └── mappings.js     # User mapping persistence functions
│   └── index.js            # Main entry point (loads .env, sets command menu, launches bot)
├── bot-data/               # Local bind mount directory for SQLite (UID 1000)
├── data/                   # Fallback local data directory
├── .dockerignore
├── .env                    # Secrets and configuration (gitignored, do not overwrite)
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
└── README.md
```

---

## Jira Cloud API Endpoints
All requests authenticate using Basic Auth (`JIRA_EMAIL:JIRA_API_TOKEN`).

1. `GET {JIRA_BASE_URL}/rest/api/3/myself`
   - Sanity check only; not used in core application logic.
2. `GET {JIRA_BASE_URL}/rest/api/3/user/search?query=<email>`
   - Used by `/register`. Returns an array of user objects; extract `accountId` from the first match.
   - Returns `[]` if no user matches or if directory search permissions are missing.
3. `GET {JIRA_BASE_URL}/rest/api/3/search/jql`
   - Used by `/todo`, `/inprogress`, `/done`.
   - Query params: `jql=assignee = "<accountId>" AND status = "<status>"`.
   - Dynamic `fields` param: `/done` requests just `summary` (lean), others request `summary,status,assignee,priority,duedate`.
   - Response contains an `issues` array where each item has `key` and requested `fields.*`.

> ⚠️ **CRITICAL NOTE**: The legacy endpoint `/rest/api/3/search` is deprecated and removed in Jira Cloud. **Always use `/rest/api/3/search/jql`**.

---

## Project Status & Phases

### Phase 1: Complete ✅
- `/register <jira_email>`: Maps Telegram user to Jira `accountId`.
- `/todo` & `/inprogress`: Lists assigned tasks sorted by urgency (Overdue > Soonest > No Date) with Khmer localization, 5-level priority emojis (`ខ្ពស់បំផុត` 🔴, `ខ្ពស់` 🟠, `មធ្យម` 🟡, `ទាប` 🔵, `ទាបបំផុត` ⚪, `គ្មាន` ⚪), and formatted due dates with merged overdue flags (`⚠️ ផុតកំណត់`).
- `/done`: Simplifies to a clean, alphabetically sorted list of completed tasks (`fields=summary`).
- `/help`: Centralized help message in Khmer explaining all commands.
- Catch-all fallback for unrecognized messages directing users to `/help`.
- Native Telegram command menu registered via `bot.telegram.setMyCommands()`.
- Containerized using Docker & Docker Compose with persistent bind mount storage.
- Validated and tested working in Telegram.

### Phase 2: Not Started ⏳
- Daily cron report
- 8:00 AM daily reminder
- Admin dashboard

---

## Verification & Testing Rule
- **Always verify changes by actively testing them (e.g., executing the code/checking against real or mock interactions) before claiming completion.**
- Do not report a task or feature as done solely because the code was written.
