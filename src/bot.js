const { Telegraf } = require('telegraf');
const { handleRegister } = require('./commands/register');
const { handleTasks } = require('./commands/tasks');

function createBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not defined in the environment variables.');
    }

    const bot = new Telegraf(token);

    // Global /start command
    bot.start((ctx) => {
        ctx.reply(
            `សូមស្វាគមន៍មកកាន់ Jira Task Tracker Bot! 👋\n\n` +
            `ពាក្យបញ្ជាដែលអាចប្រើបាន:\n` +
            `/register <jira_email> - ភ្ជាប់គណនី Jira របស់អ្នក\n` +
            `/todo - មើលកិច្ចការត្រូវធ្វើ\n` +
            `/inprogress - មើលកិច្ចការកំពុងធ្វើ\n` +
            `/done - មើលកិច្ចការដែលបានធ្វើរួច`
        );
    });

    // Register commands
    bot.command('register', handleRegister);
    bot.command('todo', (ctx) => handleTasks(ctx, 'To Do'));
    bot.command('inprogress', (ctx) => handleTasks(ctx, 'In Progress'));
    bot.command('done', (ctx) => handleTasks(ctx, 'Done'));

    return bot;
}

module.exports = {
    createBot
};
