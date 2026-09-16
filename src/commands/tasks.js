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
        const issues = await jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, status);

        if (!issues || issues.length === 0) {
            return ctx.reply(`គ្មានភារកិច្ចណាមួយត្រូវបានរកឃើញដោយមានស្ថានភាព "${status}" ទេ។`);
        }

        const baseUrl = process.env.JIRA_BASE_URL.replace(/\/+$/, '');
        let message = `📋 *Tasks - ${status}* (${issues.length}):\n\n`;

        issues.forEach((issue, index) => {
            const issueKey = issue.key;
            const summary = issue.fields?.summary || 'No summary';
            const issueUrl = `${baseUrl}/browse/${issueKey}`;

            // Markdown formatted output
            message += `${index + 1}. [${issueKey}](${issueUrl}): ${escapeMarkdown(summary)}\n`;
        });

        return ctx.replyWithMarkdown(message, { disable_web_page_preview: true });
    } catch (error) {
        console.error(`Error handling task command for status "${status}":`, error);
        return ctx.reply('An error occurred while fetching your Jira tasks. Please try again later.');
    }
}

// Basic markdown escaper for common characters that could break parsing
function escapeMarkdown(text) {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

module.exports = {
    handleTasks
};
