function getHelpMessage() {
    return (
        `សូមស្វាគមន៍មកកាន់ Jira Task Tracker Bot! 👋\n\n` +
        `ពាក្យបញ្ជាដែលអាចប្រើបាន:\n` +
        `/register jira@example.com - ភ្ជាប់គណនី Telegram របស់អ្នកទៅកាន់ Jira\n` +
        `/myaccount - មើលព័ត៌មានគណនីរបស់អ្នក\n` +
        `/todo - មើលកិច្ចការត្រូវធ្វើ (To Do)\n` +
        `/inprogress - មើលកិច្ចការកំពុងធ្វើ (In Progress)\n` +
        `/done - មើលកិច្ចការដែលបានធ្វើរួច (Done)\n` +
        `/help - មើលរបៀបប្រើប្រាស់ និងពាក្យបញ្ជាទាំងអស់`
    );
}

async function handleHelp(ctx) {
    return ctx.reply(getHelpMessage());
}

module.exports = {
    handleHelp,
    getHelpMessage
};
