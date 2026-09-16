const jiraClient = require('../jira/client');
const { getMappingByTelegramId } = require('../db/mappings');

async function handleTasks(ctx, status) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;

    if (!telegramUserId) {
        return ctx.reply('Unable to read your Telegram user ID.');
    }

    try {
        const mapping = await getMappingByTelegramId(telegramUserId);

        if (!mapping || !mapping.jira_account_id) {
            return ctx.reply(
                'អ្នកមិនទាន់បានចុះឈ្មោះគណនី Jira របស់អ្នកនៅឡើយទេ!\n' +
                'សូមប្រើ /register <jira_email> ដើម្បីភ្ជាប់គណនីរបស់អ្នកជាមុនសិន។'
            );
        }

        await ctx.reply(`កំពុងទាញយកកិច្ចការ "${status}" ពី Jira...`);

        const isDone = status === 'Done';
        const fields = isDone ? 'summary' : 'summary,status,assignee,priority,duedate';

        const issues = await jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, status, fields);

        if (!issues || issues.length === 0) {
            return ctx.reply(`គ្មានភារកិច្ចណាមួយត្រូវបានរកឃើញដោយមានស្ថានភាព "${status}" ទេ។`);
        }

        const baseUrl = process.env.JIRA_BASE_URL.replace(/\/+$/, '');
        let message = `📋 *Tasks - ${status}* (${issues.length}):\n\n`;

        if (isDone) {
            // Sort alphabetically by issue key
            issues.sort((a, b) => (a.key || '').localeCompare(b.key || ''));

            issues.forEach((issue) => {
                const issueKey = issue.key;
                const summary = issue.fields?.summary || 'No summary';
                const issueUrl = `${baseUrl}/browse/${issueKey}`;

                message += `[${issueKey}](${issueUrl}): ${escapeMarkdown(summary)}\n\n`;
            });
        } else {
            const today = getTodayDateString();

            // Sort by urgency:
            // 1. Overdue tasks first (duedate < today)
            // 2. Upcoming tasks (duedate >= today, soonest first)
            // 3. Tasks without a due date last
            issues.sort((a, b) => {
                const dueA = a.fields?.duedate;
                const dueB = b.fields?.duedate;

                const getCategory = (due) => {
                    if (!due) return 3;
                    if (due < today) return 1;
                    return 2;
                };

                const catA = getCategory(dueA);
                const catB = getCategory(dueB);

                if (catA !== catB) {
                    return catA - catB;
                }

                if (dueA && dueB) {
                    return dueA.localeCompare(dueB);
                }

                return (a.key || '').localeCompare(b.key || '');
            });

            issues.forEach((issue) => {
                const issueKey = issue.key;
                const summary = issue.fields?.summary || 'No summary';
                const issueUrl = `${baseUrl}/browse/${issueKey}`;

                const priorityName = issue.fields?.priority?.name || 'None';
                const dueDate = issue.fields?.duedate;
                const emoji = getPriorityEmoji(priorityName);
                const formattedDueDate = formatDueDate(dueDate);

                const isOverdue = dueDate && dueDate < today;
                let dueText = '';
                if (formattedDueDate) {
                    dueText = ` | Due: ${formattedDueDate}${isOverdue ? ' ⚠️ Overdue' : ''}`;
                }

                message += `[${issueKey}](${issueUrl}): ${escapeMarkdown(summary)}\n`;
                message += `   ${emoji} ${priorityName}${dueText}\n\n`;
            });
        }

        return ctx.replyWithMarkdown(message, { disable_web_page_preview: true });
    } catch (error) {
        console.error(`Error handling task command for status "${status}":`, error);
        return ctx.reply('An error occurred while fetching your Jira tasks. Please try again later.');
    }
}

function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getPriorityEmoji(priorityName) {
    if (!priorityName) return '⚪';
    const lower = priorityName.toLowerCase();

    // Exact or substring matches, ordered specifically to prevent 'highest' triggering 'high'
    if (lower.includes('highest')) return '🔴';
    if (lower.includes('high')) return '🟠';
    if (lower.includes('medium')) return '🟡';
    if (lower.includes('lowest')) return '⚪';
    if (lower.includes('low')) return '🔵';

    return '⚪';
}

function formatDueDate(dueDateStr) {
    if (!dueDateStr) return null;
    const [year, month, day] = dueDateStr.split('-').map(Number);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!month || isNaN(month) || month < 1 || month > 12) return dueDateStr;
    return `${monthNames[month - 1]} ${day}`;
}

// Basic markdown escaper for common characters that could break parsing
function escapeMarkdown(text) {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

module.exports = {
    handleTasks
};
