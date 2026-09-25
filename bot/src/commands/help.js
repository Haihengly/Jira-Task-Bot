const { getMappingByTelegramId } = require('../db/mappings');
const { REGISTERED_COMMANDS, generateHelpCommandList } = require('../utils/commands');

function getStartMessage() {
    return (
        `សូមស្វាគមន៍មកកាន់ Jira Task Tracker Bot! 👋\n\n` +
        `សូមធ្វើការចុះឈ្មោះជាមុនសិន ដើម្បីចូលប្រើប្រាស់:\n\n` +
        `របៀបចុះឈ្មោះ:\n` +
        `ប្រើប្រាស់ពាក្យបញ្ជា /register - ភ្ជាប់គណនី Telegram របស់អ្នកទៅកាន់ Jira\n\n` +
        `សូមអរគុណ`
    );
}

function getUnregisteredHelpMessage() {
    return (
        `សូមស្វាគមន៍មកកាន់ Jira Task Tracker Bot! 👋\n\n` +
        `របៀបចុះឈ្មោះ:\n` +
        `/register - ភ្ជាប់គណនី Telegram របស់អ្នកទៅកាន់ Jira`
    );
}

function getRegisteredHelpMessage() {
    return (
        `របៀបប្រើប្រាស់ និងពាក្យបញ្ជាដែលអាចប្រើបាន: 📋\n\n` +
        generateHelpCommandList(REGISTERED_COMMANDS)
    );
}

async function handleHelp(ctx) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    let userMapping = null;
    if (telegramUserId) {
        userMapping = await getMappingByTelegramId(telegramUserId);
    }

    if (!userMapping) {
        return ctx.reply(getUnregisteredHelpMessage());
    }

    return ctx.reply(getRegisteredHelpMessage());
}

module.exports = {
    handleHelp,
    getStartMessage,
    getUnregisteredHelpMessage,
    getRegisteredHelpMessage
};
