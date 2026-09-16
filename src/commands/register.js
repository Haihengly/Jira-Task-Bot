const jiraClient = require('../jira/client');
const { saveMapping } = require('../db/mappings');

async function handleRegister(ctx) {
    const text = ctx.message?.text || '';
    const args = text.split(/\s+/).slice(1);
    const email = args[0]?.trim();

    if (!email) {
        return ctx.reply('សូមផ្តល់អ៊ីមែល Jira របស់អ្នក។\nUsage: /register <jira_email>');
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;

    if (!telegramUserId || !chatId) {
        return ctx.reply('Unable to read your Telegram /chat information.');
    }

    try {
        await ctx.reply('កំពុងស្វែងរកគណនី Jira របស់អ្នក...');
        const jiraUser = await jiraClient.findUserByEmail(email);

        if (!jiraUser || !jiraUser.accountId) {
            return ctx.reply(
                `រកមិនឃើញគណនី Jira ដែលមានអ៊ីមែល "${email}" ទេ។ ` +
                `សូមពិនិត្យអ៊ីមែលម្តងទៀត ឬសាកសួរអ្នកគ្រប់គ្រង Jira របស់អ្នក។`
            );
        }

        await saveMapping(telegramUserId, chatId, jiraUser.accountId, email);
        return ctx.reply(
            `ចុះឈ្មោះជោគជ័យ! 🎉\n` +
            `គណនី Telegram ត្រូវបានភ្ជាប់ជាមួយគណនី Jira (${jiraUser.displayName || email})។\n\n` +
            `ឥឡូវនេះអ្នកអាចប្រើ:\n` +
            `/todo - មើលកិច្ចការត្រូវធ្វើ\n` +
            `/inprogress - មើលកិច្ចការកំពុងធ្វើ\n` +
            `/done - មើលកិច្ចការដែលបានធ្វើរួច`
        );
    } catch (error) {
        console.error('Error during /register command:', error);
        return ctx.reply('An error occurred while linking your Jira account. Please try again later.');
    }
}

module.exports = {
    handleRegister
};