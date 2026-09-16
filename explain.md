Here is the complete step-by-step walkthrough of how our bot processes a request from end to end.

---

Step 1: Receiving the Message via Long Polling (bot.launch())

File involved: src/index.js

When our application starts, src/index.js calls await bot.launch(). Under the hood:

[Telegram Cloud Servers] <=== HTTP Long Poll (getUpdates) === [Our Node.js App]

1. Long Polling Loop: Telegraf initiates a continuous HTTP POST loop to Telegram’s Bot API endpoint:
https://api.telegram.org/bot<TOKEN>/getUpdates
2. Waiting for Updates: If no messages are pending, Telegram’s server holds the HTTP connection open (typically for ~30 seconds) instead of returning immediately.
3. Dispatch: The moment a user types /todo in Telegram and hits send:
   - Telegram releases the held connection and sends back a JSON Update object containing:
     - update_id
     - message.message_id
     - message.from (User profile info & user ID)
     - message.chat (Chat context & chat ID)
     - message.text: "/todo"
4. Offset Management: Telegraf acknowledges the update with an incremental offset ID so Telegram marks it as delivered and won't resend it on the next poll.

---

Step 2: Telegraf Middleware & Command Routing

Files involved: src/bot.js, src/commands/tasks.js

Once Telegraf gets the raw update:

1. Context Creation: Telegraf wraps the raw JSON update inside a unified Context object, commonly referred to as ctx. This object attaches helper methods like ctx.reply() and properties like ctx.from and ctx.chat.
2. Middleware Pipeline: Telegraf routes the update through its internal handler tree.
3. Command Matching:
   In src/bot.js, we registered:
bot.command('todo', (ctx) => handleTasks(ctx, 'To Do'));
   Telegraf inspects ctx.message.text and detects that it starts with /todo. It intercepts the match and invokes our callback: handleTasks(ctx, 'To Do') located in src/commands/tasks.js.

---

Step 3: Inside the /todo Handler (handleTasks)

Files involved: src/commands/tasks.js, src/db/mappings.js, src/jira/client.js

Here is what happens line by line inside handleTasks(ctx, 'To Do'):

A. Identifying the Sender

The user's unique numeric Telegram ID is read directly off the context:
const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;

B. Looking up the Mapping in SQLite

handleTasks calls getMappingByTelegramId(telegramUserId) from src/db/mappings.js:
const query = `SELECT * FROM users WHERE telegram_user_id = ?`;
db.get(query, [telegramUserId], (err, row) => ...);

C. Case 1: Not Registered

If row is undefined (user never ran /register):
1. The function immediately halts.
2. It sends an alert back to the user:
return ctx.reply(
    'You have not registered your Jira account yet!\n' +
    'Please use /register <jira_email> to link your account first.'
);

D. Case 2: User is Registered → Jira API Call

If a mapping is found, we extract mapping.jira_account_id and call jiraClient.getIssuesByAssigneeAndStatus() in src/jira/client.js.

1. Feedback Prompt: First, the bot quickly replies to give instant feedback:
await ctx.reply('Fetching your "To Do" tasks from Jira...');
2. JQL Endpoint Call: src/jira/client.js executes an Axios GET request:
   - URL: {JIRA_BASE_URL}/rest/api/3/search/jql
   - Query Params:
     - jql: assignee = "612345abcdef6789..." AND status = "To Do"
     - fields: summary,status,assignee
   - Headers:
     - Authorization: Basic <base64(JIRA_EMAIL:JIRA_API_TOKEN)>
     - Accept: application/json

E. Formatting the Response

Jira returns an object containing an issues array:
- If issues.length === 0, the bot replies: "No tasks found with status 'To Do'. Great job! 👍".
- If tasks are found, it iterates over each issue:
const issueKey = issue.key;                          // e.g., "PROJ-101"
const summary = issue.fields?.summary;               // e.g., "Implement login"
const issueUrl = `${baseUrl}/browse/${issueKey}`;    // Direct browser link
  It builds a formatted Markdown string:
📋 *Tasks - To Do* (2):

1. [PROJ-101](https://your-domain.atlassian.net/browse/PROJ-101): Implement login
2. [PROJ-104](https://your-domain.atlassian.net/browse/PROJ-104): Fix Docker volume permissions

---

Step 4: Sending the Reply Back to Telegram

Files involved: src/commands/tasks.js

To send the message back, handleTasks calls:
return ctx.replyWithMarkdown(message, { disable_web_page_preview: true });

Under the hood:
1. ctx.replyWithMarkdown is syntactic sugar for:
ctx.telegram.sendMessage(ctx.chat.id, message, {
    parse_mode: 'Markdown',
    disable_web_page_preview: true
});
2. Telegraf sends an HTTP POST request to the Telegram API:
POST https://api.telegram.org/bot<TOKEN>/sendMessage
Content-Type: application/json

{
  "chat_id": "987654321",
  "text": "📋 *Tasks - To Do* (2):\n\n...",
  "parse_mode": "Markdown",
  "disable_web_page_preview": true
}
3. Telegram receives this API call, validates the markdown formatting, and pushes the message down to the user's Telegram client via WebSocket or push notifications.

---

Step 5: Database Connection & Lifecycle

File involved: src/db/db.js

1. Where it is opened:
   The database connection is established at the very top of src/db/db.js:
const db = new sqlite3.Database(dbPath, (err) => { ... });
2. Lifecycle (Singleton):
   - Node.js caches imported modules in require.cache.
   - When src/db/mappings.js imports ./db, it gets the same open database instance.
   - The connection is opened once when the application boots and stays open for the entire lifetime of the Node process.
   - It does not reconnect or close per request. SQLite writes to the single local file descriptor using internal locks, which makes request execution fast with zero connection overhead.