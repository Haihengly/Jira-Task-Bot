const { Telegraf } = require('telegraf');
const { handleRegister } = require('./commands/register');
const { handleTasks } = require('./commands/tasks');
const { handleHelp, getHelpMessage } = require('./commands/help');

function createBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not defined in the environment variables.');
    }

    const bot = new Telegraf(token);

    // Global /start command
    bot.start((ctx) => {
        return ctx.reply(getHelpMessage());
    });

    // /help command
    bot.help(handleHelp);
    bot.command('help', handleHelp);

    // Register primary commands
    bot.command('register', handleRegister);
    bot.command('todo', (ctx) => handleTasks(ctx, 'To Do'));
    bot.command('inprogress', (ctx) => handleTasks(ctx, 'In Progress'));
    bot.command('done', (ctx) => handleTasks(ctx, 'Done'));

    // Fallback handler for unrecognized text messages
    // Placed after all command handlers so it only fires when no command matches
    bot.on('text', (ctx) => {
        return ctx.reply(
            `ការបញ្ជូលមិនត្រូវទម្រង់ ចុច /help ដើម្បីមើលអំពីរបៀបនៃការប្រើប្រាស់\nសូមអរគុណ!`
        );
    });

    return bot;
}

module.exports = {
    createBot
};
