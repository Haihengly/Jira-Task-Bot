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
            `Welcome to Jira Task Tracker Bot! 👋\n\n` +
            `Available Commands:\n` +
            `/register <jira_email> - Link your Jira account\n` +
            `/todo - View tasks to do\n` +
            `/inprogress - View tasks in progress\n` +
            `/done - View completed tasks`
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
