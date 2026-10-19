# Jira Telegram Bot (MPWT Khmer Task & Report System)

A 1-on-1 Telegram bot and automated reporting system integrated with **Jira Cloud**, designed in Khmer for staff at the Ministry of Public Works and Transport (MPWT) to track tasks, receive real-time assignment notifications, and export official landscape A4 PDF task reports.

---

## Features

- **Two-Step Atlassian OAuth 2.0 (3LO) Account Linking**:
  - Guided precheck flow (`/link`, `/changeaccount`) that helps users verify their active Atlassian session before generating a 10-minute one-time OAuth state token.
  - Validates that the authorized Atlassian account has access to the configured Jira Cloud site (`JIRA_BASE_URL` / `JIRA_CLOUD_ID`), preventing accidental linking to personal or third-party Jira workspaces.
  - Protects account switching (`/changeaccount`) and unlinking (`/deleteaccount`) with interactive inline confirmations and a 10-minute expiration TTL.
- **Interactive Khmer Task Management (`/mytasks` & `/myaccount`)**:
  - View tasks by status (**ត្រូវធ្វើ / To Do**, **កំពុងធ្វើ / In Progress**, **បានធ្វើរួច / Done**) grouped by project and sorted by urgency (overdue first, soonest due date next, no due date last).
  - HTML-formatted task cards with clickable issue-type links (`កិច្ចការ`, `កិច្ចការរង`, `កំហុស`) opening the issue in Jira, decimal subtask numbering (`1.1`, `1.2`), `<pre>` full-title blocks, Khmer priority & due dates, and `⚠️ ផុតកំណត់` overdue indicators.
  - `/myaccount` displays linked Jira profile details and uncapped, paginated task counts across all statuses.
- **Official Khmer Government Letterhead PDF Reports (`/export`, `/pdf`)**:
  - Generates landscape A4 PDF reports with the MPWT letterhead (`Moul` header font bundled locally + system `Noto Sans Khmer` body font) using a persistent, shared headless Chromium instance with automatic crash recovery.
  - Supports single-status reports (**To Do**, **In Progress**, **Done**) and a unified 10-column **"ទាំងអស់" (All)** report combining `In Progress` → `To Do` → `Done` with status badges, resolved dates, and nested subtasks.
- **Real-Time Jira Webhook Notifications (`POST /webhook/jira`)**:
  - Sends instant Telegram DMs when a task is assigned (`🔔`), reassigned between users, or unassigned (`🔕`), automatically enriching missing issue fields from Jira.
- **Automated Daily Cron Reports (`cron-service`)**:
  - **Morning Report (`08:00`, Mon–Fri)**: Sends a merged `In Progress` + `To Do` PDF report to each registered user.
  - **Evening Report (`17:00`, Mon–Fri)**: Sends a PDF report of tasks resolved (`Done`) today in Cambodia time (`Asia/Phnom_Penh`).
  - Sends an execution summary (`✅ [Cron Report]` or `⚠️ [Cron Alert]`) to `ADMIN_CHAT_ID` after each run.

---

## Architecture & Project Structure

The project runs as three Docker Compose services sharing a local SQLite database volume:

1. **`bot` (`jira-telegram-bot`)**: Runs the Telegraf polling bot and an Express server on port `3030` (OAuth 2.0 routes, Jira webhook receiver, and internal PDF report generator with shared Puppeteer Chromium).
2. **`cron-service` (`jira-telegram-cron-service`)**: Standalone scheduler (`node-cron`) that reads user mappings from SQLite in **read-only** mode (`:ro`), requests PDFs from `bot` over the internal Docker network, and dispatches daily Telegram reminders.
3. **`cloudflared`**: Exposes `bot:3030` to the public domain (`PUBLIC_BASE_URL`) via Cloudflare Tunnel for Atlassian OAuth callbacks and Jira webhooks.

```text
jira-telegram-bot/
├── bot/                          # Main Telegram bot + Express server + Puppeteer PDF engine
│   ├── .dockerignore
│   ├── package.json
│   └── src/
│       ├── index.js              # Entry point (loads .env, sets command menus, starts bot & Express)
│       ├── bot.js                # Telegraf bot setup, command & callback registrations
│       ├── webhook.js            # Express server bootstrap (mounts route modules on PORT 3030)
│       ├── utils.js              # Shared helpers (PUBLIC_BASE_URL, Cambodia dates, urgency sort, escaping)
│       ├── auth/
│       │   └── state.js          # In-memory OAuth state store (10-min TTL & one-time consumption)
│       ├── routes/
│       │   ├── oauth.js          # GET /auth/jira, GET /auth/callback & renderStatusPage helper
│       │   ├── internalReport.js # POST /internal/generate-report (authenticated with X-Internal-Key)
│       │   └── jiraWebhook.js    # POST /webhook/jira (real-time assign/reassign/unassign DMs)
│       ├── commands/
│       │   ├── link.js           # /link & /changeaccount two-step OAuth flow + confirmation
│       │   ├── deleteaccount.js  # /deleteaccount confirmation & cleanup
│       │   ├── myaccount.js      # /myaccount profile & paginated task counts
│       │   ├── tasks.js          # /mytasks, /export (/pdf), status navigation & HTML task formatting
│       │   └── help.js           # /start & /help messages
│       ├── pdf/
│       │   ├── assets/           # Local Moul-Regular.ttf font & ornamental divider assets
│       │   └── generateTaskReport.js # Shared-Chromium PDF renderer & HTML templates
│       ├── jira/
│       │   └── client.js         # Jira Cloud REST API v3 client (paginated JQL search, issue & user lookup)
│       ├── db/
│       │   ├── db.js             # SQLite connection & schema initialization
│       │   └── mappings.js       # User mapping CRUD helpers
│       └── utils/
│           ├── commands.js       # Telegram command definitions & reply keyboard layouts
│           └── userState.js      # In-memory user navigation mode state (text vs. PDF export hub)
├── cron-service/                 # Scheduled Morning & Evening PDF reminder service
│   ├── .dockerignore
│   ├── package.json
│   └── src/
│       ├── index.js              # Cron scheduler & one-shot CLI runner (--run=morning|evening)
│       ├── db.js                 # Read-only SQLite user queries
│       └── formatting.js         # Cambodia date & Markdown escaping helpers
├── bot-data/                     # Persistent SQLite bind mount (must be owned by UID:GID 1000:1000)
├── .env.example                  # Template for environment variables
├── docker-compose.yml            # Multi-container orchestration (bot, cron-service, cloudflared)
├── Dockerfile.bot                # Multi-stage Alpine image (Chromium + Khmer fonts + SQLite runtime)
├── Dockerfile.cron-service       # Multi-stage Alpine image (lightweight Node + SQLite runtime)
└── test-cron.sh                  # Convenience script to trigger manual morning/evening cron runs
```

---

## Prerequisites

1. **Docker & Docker Compose** installed on the host machine.
2. **Telegram Bot Token** created via [@BotFather](https://t.me/BotFather).
3. **Jira Cloud Service Account & API Token** with permission to read issues and users in your Jira projects.
4. **Atlassian OAuth 2.0 (3LO) App** created in the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
5. **Public HTTPS Domain / Cloudflare Tunnel** routing traffic to `http://bot:3030` (used for `/auth/jira`, `/auth/callback`, and `/webhook/jira`).

---

## Full Step-by-Step Setup Guide

### Step 1: Clone the Repository & Create `.env`

```bash
cp .env.example .env
```

Edit `.env` and fill in every variable:

| Variable | Required | Default / Example | Description |
| :--- | :---: | :--- | :--- |
| `JIRA_EMAIL` | Yes | `admin@example.com` | Email of the Jira Cloud account used for backend API requests. |
| `JIRA_API_TOKEN` | Yes | `ATATT3xFfGF0...` | Jira API token generated at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens). |
| `JIRA_BASE_URL` | Yes | `https://your-site.atlassian.net` | Base URL of your Jira Cloud site (no trailing slash). |
| `JIRA_CLOUD_ID` | Optional | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Optional Jira Cloud ID for additional OAuth site matching alongside `JIRA_BASE_URL`. |
| `ATLASSIAN_CLIENT_ID` | Yes | `smR5UBk8...` | Client ID from your Atlassian OAuth 2.0 (3LO) app. |
| `ATLASSIAN_CLIENT_SECRET` | Yes | `ATOA...` | Client Secret from your Atlassian OAuth 2.0 (3LO) app. |
| `PUBLIC_BASE_URL` | Yes | `https://jirabot.kaizenops.site` | Public HTTPS base URL pointing to the `bot` Express server (trailing slashes are stripped automatically). |
| `TELEGRAM_BOT_TOKEN` | Yes | `123456789:AAH...` | Telegram bot token from [@BotFather](https://t.me/BotFather). |
| `PORT` | Optional | `3030` | Port on which the `bot` Express server listens inside the container. |
| `DB_PATH` | Yes | `/app/data/mapping.db` | Path to the SQLite database file inside the containers. |
| `INTERNAL_API_KEY` | Yes | *(random 32+ char secret)* | Shared secret between `cron-service` and `bot` (`X-Internal-Key` header). Generate with `openssl rand -hex 32`. |
| `BOT_INTERNAL_URL` | Yes | `http://bot:3030/internal/generate-report` | Internal Docker URL called by `cron-service` to render PDFs. |
| `MORNING_CRON_SCHEDULE` | Optional | `0 8 * * 1-5` | Cron schedule for Morning reports (default: 08:00 Mon–Fri). |
| `EVENING_CRON_SCHEDULE` | Optional | `0 17 * * 1-5` | Cron schedule for Evening reports (default: 17:00 Mon–Fri). |
| `CRON_TIMEZONE` | Optional | `Asia/Phnom_Penh` | Timezone used by `cron-service` schedules. |
| `ADMIN_CHAT_ID` | Optional | `7845153640` | Telegram chat ID that receives cron execution summaries and failure alerts. |

---

### Step 2: Configure External Integrations

#### 2.1 Atlassian OAuth 2.0 (3LO) App
1. Go to the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/) and create an **OAuth 2.0 integration**.
2. Under **Permissions**, add and configure:
   - **User identity API** → Classic scope: `read:me`
   - **Jira API** → Classic scope: `read:jira-user`
3. Under **Authorization**, configure **OAuth 2.0 (3LO)** and set the **Callback URL** to match `${PUBLIC_BASE_URL}/auth/callback` **exactly**:
   ```text
   https://jirabot.kaizenops.site/auth/callback
   ```
   *(If you use a custom domain in `PUBLIC_BASE_URL`, set `https://<your-domain>/auth/callback` here).*
4. Under **Settings**, copy the **Client ID** and **Secret** into `ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET` in `.env`.

#### 2.2 Jira Cloud Webhook (Real-Time Task Assignment Notifications)
1. In Jira Cloud, go to **Settings (⚙️) → System → WebHooks** (`https://<your-site>.atlassian.net/plugins/servlet/webhooks`).
2. Click **Create a WebHook**:
   - **Name**: `Jira Telegram Bot`
   - **Status**: `Enabled`
   - **URL**: `https://jirabot.kaizenops.site/webhook/jira` *(or `${PUBLIC_BASE_URL}/webhook/jira`)*
   - **Issue related events**: Check **Issue → updated**
3. Save the webhook. Whenever an issue's assignee changes, the bot will send `🔔` (assigned) and/or `🔕` (unassigned) notifications to the mapped Telegram users.

#### 2.3 Cloudflare Tunnel (`cloudflared`)
The `docker-compose.yml` includes a `cloudflared` service mounting `~/.cloudflared` and `./config.yml`. Ensure your tunnel configuration routes your `PUBLIC_BASE_URL` hostname to `http://bot:3030`:

```yaml
tunnel: <your-tunnel-uuid>
credentials-file: /home/nonroot/.cloudflared/<your-tunnel-uuid>.json

ingress:
  - hostname: jirabot.kaizenops.site
    service: http://bot:3030
  - service: http_status:404
```

---

### Step 3: Initialize SQLite Storage & Launch with Docker Compose

Both `bot` and `cron-service` run as the non-root `node` user (`UID 1000`, `GID 1000`). Create `./bot-data` and set ownership to `1000:1000` before starting the containers:

```bash
mkdir -p ./bot-data
sudo chown -R 1000:1000 ./bot-data
docker compose up -d --build
```

Check that the containers are running and healthy:

```bash
docker compose ps
docker compose logs -f bot cron-service
```

Expected startup logs from `bot`:
```text
Express webhook server listening on port 3030
Connected to the SQLite database at /app/data/mapping.db
Database schema initialized.
Unique index on jira_account_id ensured.
Global command menu set successfully.
Starting Telegram bot in polling mode...
Bot is running and listening for messages!
```

---

## Usage & Commands

### Telegram Commands

| Command | Access | Description |
| :--- | :---: | :--- |
| `/start` | All users | Displays welcome message and initializes the reply keyboard. |
| `/help` | All users | Shows context-aware help instructions based on registration status. |
| `/link` | Unregistered | Starts the 2-step Atlassian OAuth 2.0 linking flow. |
| `/mytasks` | Registered | Opens the task status menu (`ត្រូវធ្វើ`, `កំពុងធ្វើ`, `បានធ្វើរួច`) to view formatted tasks in chat. |
| `/export` or `/pdf` | Registered | Opens the PDF Export Hub (`ត្រូវធ្វើ`, `កំពុងធ្វើ`, `បានធ្វើរួច`, `ទាំងអស់`). |
| `/myaccount` | Registered | Shows your linked Jira account details and total task counts per status. |
| `/changeaccount` | Registered | Starts the 2-step flow to switch to a different Jira account (with confirmation). |
| `/deleteaccount` | Registered | Unlinks your Jira account from Telegram (with confirmation). |

### HTTP Endpoints (`bot` on Port `3030`)

| Method & Path | Module | Description |
| :--- | :--- | :--- |
| `GET /auth/jira?state=<token>` | `src/routes/oauth.js` | Validates the one-time OAuth state token and redirects (`302`) to Atlassian's `/authorize` screen. |
| `GET /auth/callback` | `src/routes/oauth.js` | Exchanges OAuth code for token, verifies access to `JIRA_BASE_URL`, links the user in SQLite, and renders Khmer HTML status pages. |
| `POST /webhook/jira` | `src/routes/jiraWebhook.js` | Receives Jira `issue_assigned` events and sends HTML Telegram DMs (`🔔` / `🔕`) to mapped users. |
| `POST /internal/generate-report` | `src/routes/internalReport.js` | Internal endpoint called by `cron-service` (protected by `X-Internal-Key`) to generate Morning/Evening PDF reports. |

---

## Testing & Manual Cron Execution

### Run a Manual Cron Test for a Single User
You can trigger a one-shot manual run of the Morning or Evening cron job without waiting for the scheduled time:

```bash
# Using the helper script (defaults to the test user configured in test-cron.sh):
bash ./test-cron.sh morning
bash ./test-cron.sh evening

# Or specify any Telegram user ID directly:
docker compose run --rm cron-service node src/index.js --run=morning --user=<telegram_user_id>
docker compose run --rm cron-service node src/index.js --run=evening --user=<telegram_user_id>
```

> **Warning**: Omitting `--user=<telegram_user_id>` will send the PDF report to **all** registered users in the database.

---

## Maintenance & Troubleshooting

- **`SQLITE_CANTOPEN: unable to open database file`**:
  Ensure `./bot-data` on the host is owned by UID/GID `1000:1000`:
  ```bash
  sudo chown -R 1000:1000 ./bot-data
  docker compose restart bot cron-service
  ```
- **Rebuilding After Code Changes**:
  ```bash
  docker compose up -d --build bot cron-service
  ```
- **User Linked Wrong Atlassian Account / Unauthorized Jira Site**:
  If a user is signed into a different Atlassian account in their browser when clicking `/link`, the bot rejects the OAuth callback (`403`) and instructs them to:
  1. Log out at [id.atlassian.com](https://id.atlassian.com)
  2. Sign back in with their work Jira account
  3. Run `/link` or `/changeaccount` again in Telegram to generate a fresh link.
