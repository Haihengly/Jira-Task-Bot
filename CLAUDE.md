# CLAUDE.md

## Project Overview
A 1-on-1 Telegram bot that integrates with Jira Cloud for staff task tracking.
- **Runtime & Frameworks**: Node.js, Telegraf (Telegram Bot library), Axios (Jira API), SQLite3 (storage), Dotenv.
- **Database**: SQLite (`data/mappings.sqlite`), mapping `telegram_user_id`, `chat_id`, `jira_account_id`, and `jira_email`.

---

## Git Rules
- **Do NOT push** to remote repositories (`git push`). The user will handle pushes manually.
- Commits are only made when requested.

---

## Project Structure
```
jira-telegram-bot/
├── src/
│   ├── bot.js              # Telegraf setup, registers command handlers
│   ├── commands/
│   │   ├── register.js     # /register logic (Jira user lookup + DB mapping)
│   │   └── tasks.js        # /todo, /inprogress, /done (shared JQL search handler)
│   ├── jira/
│   │   └── client.js       # Isolated Jira API client (Basic Auth)
│   ├── db/
│   │   ├── db.js           # SQLite connection & schema initialization
│   │   └── mappings.js     # User mapping persistence functions
│   └── index.js            # Main entry point (loads .env, launches bot)
├── data/                   # SQLite database storage (gitignored)
├── .env                    # Secrets and configuration (gitignored, do not overwrite)
├── .env.example
├── .gitignore
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
   - Query params: `jql=assignee = "<accountId>" AND status = "<status>"`, `fields=summary,status,assignee`.
   - Response contains an `issues` array where each item has `key` and `fields.summary`.

> ⚠️ **CRITICAL NOTE**: The legacy endpoint `/rest/api/3/search` is deprecated and removed in Jira Cloud. **Always use `/rest/api/3/search/jql`**.

---

## Project Status & Phases

### Phase 1: Complete ✅
- `/register <jira_email>`: Maps Telegram user to Jira `accountId`.
- `/todo`: Lists assigned Jira issues with status `"To Do"`.
- `/inprogress`: Lists assigned Jira issues with status `"In Progress"`.
- `/done`: Lists assigned Jira issues with status `"Done"`.
- Validated and tested working in Telegram.

### Phase 2: Not Started ⏳
- Daily cron report
- 8:00 AM daily reminder
- Admin dashboard

---

## Verification & Testing Rule
- **Always verify changes by actively testing them (e.g., executing the code/checking against real or mock interactions) before claiming completion.**
- Do not report a task or feature as done solely because the code was written.
