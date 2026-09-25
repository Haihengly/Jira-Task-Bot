const { Telegraf } = require('telegraf');
const { handleRegister, handleConfirmRegister, handleCancelRegister } = require('./commands/register');
const { handleTasks, handleMyTasks } = require('./commands/tasks');
const { handleMyAccount } = require('./commands/myaccount');
const { handleHelp, getStartMessage } = require('./commands/help');
const { getMappingByTelegramId } = require('./db/mappings');

function createBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not defined in the environment variables.');
    }

    const bot = new Telegraf(token);

    // Registration middleware
    bot.use(async (ctx, next) => {
        // Allow inline queries/callbacks to pass through, or handle them specifically if needed
        // For this requirement, we focus on commands.
        // Let's check if the message is a text command
        if (ctx.message && ctx.message.text) {
            const text = ctx.message.text.trim();
            // Check if it's one of the exempt commands
            if (text.startsWith('/register') || text.startsWith('/start') || text.startsWith('/help')) {
                return next();
            }

            // For all other messages/commands, check registration
            const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
            if (telegramUserId) {
                const userMapping = await getMappingByTelegramId(telegramUserId);
                if (!userMapping) {
                    return ctx.reply('អ្នកមិនទាន់បានចុះឈ្មោះទេ។ សូមប្រើ /register <jira_email> ជាមុនសិន។');
                }
            }
        }

        // Let callbacks (button clicks) pass through for now, as they have their own logic
        // or check them too if they represent commands.
        // For inline registration buttons, they need to bypass this if the user isn't fully registered yet.
        if (ctx.callbackQuery) {
             const callbackData = ctx.callbackQuery.data;
             if (callbackData === 'confirm_register' || callbackData === 'cancel_register' ||
                 callbackData === 'tasks_todo' || callbackData === 'tasks_inprogress' || callbackData === 'tasks_done') {
                 return next();
             }
        }

        return next();
    });

    // Global /start command
    bot.start(async (ctx) => {
        const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
        const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;
        if (telegramUserId && chatId) {
            try {
                const userMapping = await getMappingByTelegramId(telegramUserId);
                if (!userMapping) {
                    await ctx.telegram.setMyCommands([
                        { command: 'register', description: 'ភ្ជាប់គណនី Jira របស់អ្នក' },
                        { command: 'help', description: 'មើលអំពីរបៀបប្រើប្រាស់' }
                    ], { scope: { type: 'chat', chat_id: chatId } });
                }
            } catch (e) {
                // Ignore any error silently
            }
        }
        return ctx.reply(getStartMessage());
    });

    // /help command
    bot.help(handleHelp);
    bot.command('help', handleHelp);

    // Register primary commands
    bot.command('register', handleRegister);
    bot.command('myaccount', handleMyAccount);
    bot.command('mytasks', handleMyTasks);

    // Handle inline button callbacks for registration confirmation
    bot.action('confirm_register', handleConfirmRegister);
    bot.action('cancel_register', handleCancelRegister);

    // Handle inline button callbacks for /mytasks
    bot.action('tasks_todo', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        return handleTasks(ctx, 'To Do');
    });
    bot.action('tasks_inprogress', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        return handleTasks(ctx, 'In Progress');
    });
    bot.action('tasks_done', async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        return handleTasks(ctx, 'Done');
    });

    // Fallback handler for unrecognized messages (text, photos, voice notes, stickers, documents, etc.)
    // Placed after all command handlers so it only fires when nothing else matched
    bot.on('message', (ctx) => {
        return ctx.reply(
            `ការបញ្ជូលមិនត្រូវទម្រង់ចុច /help ដើម្បីមើលអំពីរបៀបនៃការប្រើប្រាស់\nសូមអរគុណ!`
        );
    });

    return bot;
}

module.exports = {
    createBot
};
