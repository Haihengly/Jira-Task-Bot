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
                'សូមប្រើ /register jira@example.com ដើម្បីភ្ជាប់គណនីរបស់អ្នកជាមុនសិន។'
            );
        }

        const isDone = status === 'Done';
        const fields = isDone ? 'summary,project' : 'summary,status,assignee,priority,duedate,project';

        const issues = await jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, status, fields);

        if (!issues || issues.length === 0) {
            let emptyMessage = '';
            if (status === 'To Do') emptyMessage = 'មិនទាន់មានកិច្ចការត្រូវធ្វើនោះទេ។';
            else if (status === 'In Progress') emptyMessage = 'មិនទាន់មានកិច្ចការកំពុងធ្វើនោះទេ។';
            else if (status === 'Done') emptyMessage = 'មិនទាន់មានកិច្ចការដែលបានធ្វើរួចនោះទេ។ 👍';

            return ctx.reply(emptyMessage);
        }

        const baseUrl = process.env.JIRA_BASE_URL.replace(/\/+$/, '');

        // Khmer headers
        let headerStatus = status;
        if (status === 'To Do') headerStatus = 'ត្រូវធ្វើ';
        else if (status === 'In Progress') headerStatus = 'កំពុងធ្វើ';
        else if (status === 'Done') headerStatus = 'បានធ្វើរួច';

        let message = `📋 *កិច្ចការ${headerStatus}* (${issues.length}):\n`;

        // Group issues by project name
        const groupedIssues = {};
        issues.forEach(issue => {
            const projectName = issue.fields?.project?.name || 'Unknown Project';
            if (!groupedIssues[projectName]) {
                groupedIssues[projectName] = [];
            }
            groupedIssues[projectName].push(issue);
        });

        // Sort project names alphabetically
        const sortedProjectNames = Object.keys(groupedIssues).sort((a, b) => a.localeCompare(b));

        const today = isDone ? null : getTodayDateString();

        sortedProjectNames.forEach(projectName => {
            const projectIssues = groupedIssues[projectName];

            message += `\n🗂 *${escapeMarkdown(projectName)}*\n`;

            if (isDone) {
                // Sort alphabetically by issue key
                projectIssues.sort((a, b) => (a.key || '').localeCompare(b.key || ''));

                projectIssues.forEach((issue) => {
                    const issueKey = issue.key;
                    const summary = issue.fields?.summary || 'No summary';
                    const issueUrl = `${baseUrl}/browse/${issueKey}`;

                    message += `[${issueKey}](${issueUrl}): ${escapeMarkdown(summary)}\n\n`;
                });
            } else {
                // Sort by urgency:
                // 1. Overdue tasks first (duedate < today)
                // 2. Upcoming tasks (duedate >= today, soonest first)
                // 3. Tasks without a due date last
                projectIssues.sort((a, b) => {
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

                projectIssues.forEach((issue) => {
                    const issueKey = issue.key;
                    const summary = issue.fields?.summary || 'No summary';
                    const issueUrl = `${baseUrl}/browse/${issueKey}`;

                    const priorityName = issue.fields?.priority?.name || 'None';
                    const dueDate = issue.fields?.duedate;
                    const { emoji, label } = getKhmerPriority(priorityName);
                    const formattedDueDate = formatDueDate(dueDate);

                    const isOverdue = dueDate && dueDate < today;
                    let dueText = '';
                    if (formattedDueDate) {
                        dueText = ` | ថ្ងៃកំណត់៖ ${formattedDueDate}${isOverdue ? ' ⚠️ ផុតកំណត់' : ''}`;
                    }

                    message += `[${issueKey}](${issueUrl}): ${escapeMarkdown(summary)}\n`;
                    message += `   ${emoji} ${label}${dueText}\n\n`;
                });
            }
        });

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

function getKhmerPriority(priorityName) {
    if (!priorityName || priorityName.toLowerCase() === 'none') {
        return { emoji: '⚪', label: 'គ្មាន' };
    }

    const lower = priorityName.toLowerCase();

    // Exact or substring matches, ordered specifically to prevent 'highest' triggering 'high'
    if (lower.includes('highest')) return { emoji: '🔴', label: 'ខ្ពស់បំផុត' };
    if (lower.includes('high')) return { emoji: '🟠', label: 'ខ្ពស់' };
    if (lower.includes('medium')) return { emoji: '🟡', label: 'មធ្យម' };
    if (lower.includes('lowest')) return { emoji: '⚪', label: 'ទាបបំផុត' };
    if (lower.includes('low')) return { emoji: '🔵', label: 'ទាប' };

    return { emoji: '⚪', label: 'គ្មាន' };
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
