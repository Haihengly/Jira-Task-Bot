const { Telegraf, Markup } = require('telegraf');
const {
    handleRegister,
    handleChangeAccount,
    handleConfirmRegister,
    handleCancelRegister,
    isAwaitingEmail,
    cancelAwaitingEmail,
    handleConversationalEmail
} = require('./commands/register');
const { handleDeleteAccount, handleConfirmDeleteAccount, handleCancelDeleteAccount } = require('./commands/deleteaccount');
const { handleTasks, handleMyTasks } = require('./commands/tasks');
const { handleMyAccount } = require('./commands/myaccount');
const { handleHelp, getStartMessage, getRegisteredStartMessage } = require('./commands/help');
const { getMappingByTelegramId } = require('./db/mappings');
const {
    KEYBOARD_BUTTONS,
    getRegisteredKeyboard,
    getUnregisteredKeyboard,
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
            const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;

            // Check if it's one of the exempt commands / buttons or awaiting email input (for plain text)
            if (
                text.startsWith('/register') ||
                text.startsWith('/start') ||
                text.startsWith('/help') ||
                text.startsWith('/deleteaccount') ||
                text === KEYBOARD_BUTTONS.REGISTER ||
                text === KEYBOARD_BUTTONS.HELP ||
                text === KEYBOARD_BUTTONS.DELETE_ACCOUNT ||
                (telegramUserId && isAwaitingEmail(telegramUserId) && !text.startsWith('/'))
            ) {
                return next();
            }

            // For registered-only commands and buttons (/myaccount, /mytasks, /changeaccount, etc.), check registration
            if (
                text.startsWith('/myaccount') ||
                text.startsWith('/mytasks') ||
                text.startsWith('/changeaccount') ||
                text === KEYBOARD_BUTTONS.MY_ACCOUNT ||
                text === KEYBOARD_BUTTONS.MY_TASKS ||
                text === KEYBOARD_BUTTONS.CHANGE_ACCOUNT
            ) {
                if (telegramUserId) {
                    const userMapping = await getMappingByTelegramId(telegramUserId);
                    if (!userMapping) {
                        return ctx.reply('អ្នកមិនទាន់បានចុះឈ្មោះទេ។ សូមប្រើ /register ជាមុនសិន។');
                    }
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
        if (telegramUserId) {
            cancelAwaitingEmail(telegramUserId);
        }
        let isRegistered = false;
        let userMapping = null;
        if (telegramUserId) {
            try {
                userMapping = await getMappingByTelegramId(telegramUserId);
                if (userMapping) {
                    isRegistered = true;
                }
                if (chatId) {
                    if (isRegistered) {
                        await ctx.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: chatId } });
                    } else {
                        await ctx.telegram.setMyCommands(UNREGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: chatId } });
                    }
                }
            } catch (e) {
                // Ignore any error silently
            }
        }

        if (isRegistered) {
            return ctx.reply(getRegisteredStartMessage(userMapping), getRegisteredKeyboard());
        } else {
            return ctx.reply(getStartMessage(), getUnregisteredKeyboard());
        }
    });

    // /help command
    bot.help(handleHelp);
    bot.command('help', handleHelp);

    // Register primary commands
    bot.command('register', handleRegister);
    bot.command('changeaccount', handleChangeAccount);
    bot.command('deleteaccount', handleDeleteAccount);
    bot.command('myaccount', handleMyAccount);
    bot.command('mytasks', handleMyTasks);

    // Register reply keyboard button listeners
    bot.hears(KEYBOARD_BUTTONS.REGISTER, handleRegister);
    bot.hears(KEYBOARD_BUTTONS.MY_TASKS, handleMyTasks);
    bot.hears(KEYBOARD_BUTTONS.MY_ACCOUNT, handleMyAccount);
    bot.hears(KEYBOARD_BUTTONS.CHANGE_ACCOUNT, handleChangeAccount);
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
    bot.on('message', async (ctx) => {
        const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
        const text = ctx.message?.text?.trim();

        // If user is awaiting conversational email input and message is plain text (not a command starting with /)
        if (telegramUserId && isAwaitingEmail(telegramUserId) && text && !text.startsWith('/')) {
            return handleConversationalEmail(ctx);
        }

        let isRegistered = false;
        if (telegramUserId) {
            try {
                const userMapping = await getMappingByTelegramId(telegramUserId);
                if (userMapping) {
                    isRegistered = true;
                }
            } catch (e) {
                // Ignore any error silently
            }
        }

        if (isRegistered) {
            return ctx.reply(
                `ការបញ្ជូលមិនត្រឹមត្រូវទម្រង់ សូមចុច /help ដើម្បីមើលអំពីរបៀបនៃការប្រើប្រាស់\nសូមអរគុណ!`
            );
        } else {
            return ctx.reply(
                `ការបញ្ជូលមិនត្រឹមត្រូវទម្រង់ សូមចុច /help ដើម្បីមើលអំពីរបៀបនៃការចុះឈ្មោះ\nសូមអរគុណ!`
            );
        }
    });

    return bot;
}

module.exports = {
    createBot
};
