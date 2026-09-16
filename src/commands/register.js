const jiraClient = require('../jira/client');
const { saveMapping } = require('../db/mappings');

async function handleRegister(ctx) {
    const text = ctx.message?.text || '';
    const args = text.split(/\s+/).slice(1);
    const email = args[0]?.trim();

    if (!email) {
        return ctx.reply('Please provide your Jira email.\nUsage: /register <jira_email>');
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;

    if (!telegramUserId || !chatId) {
        return ctx.reply('Unable to read your Telegram user/chat information.');
    }

    try {
        await ctx.reply('Looking up your Jira account...');
        const jiraUser = await jiraClient.findUserByEmail(email);

        if (!jiraUser || !jiraUser.accountId) {
            return ctx.reply(
                `Could not find a Jira account with the email "${email}". ` +
                `Please double-check the email address or confirm with your Jira administrator.`
            );
        }

        await saveMapping(telegramUserId, chatId, jiraUser.accountId, email);
        return ctx.reply(
            `Successfully registered! 🎉\n` +
            `Telegram account linked to Jira account (${jiraUser.displayName || email}).\n\n` +
            `You can now use:\n` +
            `/todo - view tasks to do\n` +
            `/inprogress - view tasks in progress\n` +
            `/done - view completed tasks`
        );
    } catch (error) {
        console.error('Error during /register command:', error);
        return ctx.reply('An error occurred while linking your Jira account. Please try again later.');
    }
}

module.exports = {
    handleRegister
};
