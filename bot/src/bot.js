const { Telegraf, Markup } = require('telegraf');
const { handleRegister, handleConfirmRegister, handleCancelRegister } = require('./commands/register');
const { handleDeleteAccount, handleConfirmDeleteAccount, handleCancelDeleteAccount } = require('./commands/deleteaccount');
const { handleTasks, handleMyTasks } = require('./commands/tasks');
const { handleMyAccount } = require('./commands/myaccount');
const { handleHelp, getStartMessage } = require('./commands/help');
const { getMappingByTelegramId } = require('./db/mappings');
const {
    KEYBOARD_BUTTONS,
    getRegisteredKeyboard,
    REGISTERED_COMMANDS,
    UNREGISTERED_COMMANDS
} = require('./utils/commands');

function createBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not defined in the environment variables.');
    }

    const bot = new Telegraf(token);

    // Registration middleware
    bot.use(async (ctx, next) => {
        // Check if the message is a text command or button click
        if (ctx.message && ctx.message.text) {
            const text = ctx.message.text.trim();
            // Check if it's one of the exempt commands / buttons
            if (
                text.startsWith('/register') ||
                text.startsWith('/start') ||
                text.startsWith('/help') ||
                text.startsWith('/deleteaccount') ||
                text === KEYBOARD_BUTTONS.HELP ||
                text === KEYBOARD_BUTTONS.DELETE_ACCOUNT
            ) {
                return next();
            }

            // For all other messages/commands (including /myaccount, /mytasks, and their keyboard buttons), check registration
            const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
            if (telegramUserId) {
                const userMapping = await getMappingByTelegramId(telegramUserId);
                if (!userMapping) {
                    return ctx.reply('អ្នកមិនទាន់បានចុះឈ្មោះទេ។ សូមប្រើ /register <jira_email> ជាមុនសិន។');
                }
            }
        }

        // Let callbacks (button clicks) pass through for now, as they have their own logic
        if (ctx.callbackQuery) {
            const callbackData = ctx.callbackQuery.data;
            if (
                callbackData === 'confirm_register' ||
                callbackData === 'cancel_register' ||
                callbackData === 'confirm_delete_account' ||
                callbackData === 'cancel_delete_account' ||
                callbackData === 'tasks_todo' ||
                callbackData === 'tasks_inprogress' ||
                callbackData === 'tasks_done'
            ) {
                return next();
            }
        }

        return next();
    });

    // Global /start command
    bot.start(async (ctx) => {
        const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
        const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;
        let isRegistered = false;
        if (telegramUserId && chatId) {
            try {
                const userMapping = await getMappingByTelegramId(telegramUserId);
                if (userMapping) {
                    isRegistered = true;
                    await ctx.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: chatId } });
                } else {
                    await ctx.telegram.setMyCommands(UNREGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: chatId } });
                }
            } catch (e) {
                // Ignore any error silently
            }
        }

        if (isRegistered) {
            return ctx.reply(getStartMessage(), getRegisteredKeyboard());
        } else {
            return ctx.reply(getStartMessage(), Markup.removeKeyboard());
        }
    });

    // /help command
    bot.help(handleHelp);
    bot.command('help', handleHelp);

    // Register primary commands
    bot.command('register', handleRegister);
    bot.command('deleteaccount', handleDeleteAccount);
    bot.command('myaccount', handleMyAccount);
    bot.command('mytasks', handleMyTasks);

    // Register reply keyboard button listeners
    bot.hears(KEYBOARD_BUTTONS.MY_TASKS, handleMyTasks);
    bot.hears(KEYBOARD_BUTTONS.MY_ACCOUNT, handleMyAccount);
    bot.hears(KEYBOARD_BUTTONS.HELP, handleHelp);
    bot.hears(KEYBOARD_BUTTONS.DELETE_ACCOUNT, handleDeleteAccount);

    // Handle inline button callbacks for registration confirmation
    bot.action('confirm_register', handleConfirmRegister);
    bot.action('cancel_register', handleCancelRegister);

    // Handle inline button callbacks for unregistration confirmation
    bot.action('confirm_delete_account', handleConfirmDeleteAccount);
    bot.action('cancel_delete_account', handleCancelDeleteAccount);

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
