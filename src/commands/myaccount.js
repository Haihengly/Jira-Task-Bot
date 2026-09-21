const jiraClient = require('../jira/client');
const { getMappingByTelegramId } = require('../db/mappings');

async function handleMyAccount(ctx) {
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

        const counts = await jiraClient.getIssueCountsByAssignee(mapping.jira_account_id);

        const displayName = mapping.display_name || mapping.jira_email;

        const message =
            `👤 គណនីរបស់អ្នក\n\n` +
            `ឈ្មោះគណនី: ${displayName}\n` +
            `គណនី: ${mapping.jira_email}\n\n` +
            `📋 ត្រូវធ្វើ: ${counts.todo}\n` +
            `🔄 កំពុងធ្វើ: ${counts.inProgress}\n` +
            `✅ បានធ្វើរួច: ${counts.done}`;

        return ctx.reply(message);

    } catch (error) {
        console.error('Error handling /myaccount:', error);
        return ctx.reply('An error occurred while fetching your Jira account info. Please try again later.');
    }
}

module.exports = {
    handleMyAccount
};
