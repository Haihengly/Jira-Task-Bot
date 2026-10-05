const https = require('https');
const { Telegraf } = require('telegraf');
const {
    handleLink,
    handleChangeAccount,
    handleConfirmRegister,
    handleCancelRegister,
} = require('./commands/link');
const { handleDeleteAccount, handleConfirmDeleteAccount, handleCancelDeleteAccount } = require('./commands/deleteaccount');
const {
    handleTasks,
    handleMyTasks,
    handlePdfHub,
    handlePdfToday,
    handlePdfDateRange,
    handleStatusSelection,
    handleBackNavigation,
    handleExportPdf
} = require('./commands/tasks');
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
const { clearUserMode } = require('./utils/userState');

function createBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not defined in the environment variables.');
    }

    const bot = new Telegraf(token, {
        telegram: {
            agent: new https.Agent({ family: 4 })
        }
    });

    // Registration middleware
    bot.use(async (ctx, next) => {
        // Check if the message is a text command or button click
        if (ctx.message && ctx.message.text) {
            const text = ctx.message.text.trim();
            const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;

            // Check if it's one of the exempt commands / buttons
            if (
                text.startsWith('/link') ||
                text.startsWith('/start') ||
                text.startsWith('/help') ||
                text.startsWith('/deleteaccount') ||
                text === KEYBOARD_BUTTONS.LINK ||
                text === KEYBOARD_BUTTONS.HELP ||
                text === KEYBOARD_BUTTONS.DELETE_ACCOUNT
            ) {
                return next();
            }

            // For registered-only commands and buttons (/myaccount, /mytasks, /changeaccount, /export, etc.), check registration
            if (
                text.startsWith('/myaccount') ||
                text.startsWith('/mytasks') ||
                text.startsWith('/export') ||
                text.startsWith('/pdf') ||
                text.startsWith('/changeaccount') ||
                text === KEYBOARD_BUTTONS.MY_ACCOUNT ||
                text === KEYBOARD_BUTTONS.MY_TASKS ||
                text === KEYBOARD_BUTTONS.CHANGE_ACCOUNT ||
                text === KEYBOARD_BUTTONS.EXPORT_PDF ||
                text === KEYBOARD_BUTTONS.PDF_TODAY ||
                text === KEYBOARD_BUTTONS.PDF_DATE_RANGE ||
                text === KEYBOARD_BUTTONS.TASK_TODO ||
                text === KEYBOARD_BUTTONS.TASK_INPROGRESS ||
                text === KEYBOARD_BUTTONS.TASK_DONE ||
                text === KEYBOARD_BUTTONS.BACK
            ) {
                if (telegramUserId) {
                    const userMapping = await getMappingByTelegramId(telegramUserId);
                    if (!userMapping) {
                        return ctx.reply('អ្នកមិនទាន់បានចុះឈ្មោះទេ។ សូមប្រើ /link ជាមុនសិន។');
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
                callbackData.startsWith('export_pdf_')
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
            clearUserMode(telegramUserId);
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
    bot.help((ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleHelp(ctx);
    });
    bot.command('help', (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleHelp(ctx);
    });

    // Register primary commands
    bot.command('link', (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleLink(ctx);
    });
    bot.command('changeaccount', (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleChangeAccount(ctx);
    });
    bot.command('deleteaccount', (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleDeleteAccount(ctx);
    });
    bot.command('myaccount', (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleMyAccount(ctx);
    });
    bot.command('mytasks', handleMyTasks);
    bot.command('export', handlePdfHub);
    bot.command('pdf', handlePdfHub);

    // Register reply keyboard button listeners
    bot.hears(KEYBOARD_BUTTONS.LINK, (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleLink(ctx);
    });
    bot.hears(KEYBOARD_BUTTONS.MY_TASKS, handleMyTasks);
    bot.hears(KEYBOARD_BUTTONS.MY_ACCOUNT, (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleMyAccount(ctx);
    });
    bot.hears(KEYBOARD_BUTTONS.CHANGE_ACCOUNT, (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleChangeAccount(ctx);
    });
    bot.hears(KEYBOARD_BUTTONS.HELP, (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleHelp(ctx);
    });
    bot.hears(KEYBOARD_BUTTONS.DELETE_ACCOUNT, (ctx) => {
        if (ctx.from?.id) clearUserMode(ctx.from.id);
        return handleDeleteAccount(ctx);
    });
    bot.hears(KEYBOARD_BUTTONS.EXPORT_PDF, handlePdfHub);
    bot.hears(KEYBOARD_BUTTONS.PDF_TODAY, handlePdfToday);
    bot.hears(KEYBOARD_BUTTONS.PDF_DATE_RANGE, handlePdfDateRange);
    bot.hears(KEYBOARD_BUTTONS.TASK_TODO, async (ctx) => handleStatusSelection(ctx, 'To Do'));
    bot.hears(KEYBOARD_BUTTONS.TASK_INPROGRESS, async (ctx) => handleStatusSelection(ctx, 'In Progress'));
    bot.hears(KEYBOARD_BUTTONS.TASK_DONE, async (ctx) => handleStatusSelection(ctx, 'Done'));
    bot.hears(KEYBOARD_BUTTONS.BACK, handleBackNavigation);

    // Handle inline button callbacks for registration confirmation
    bot.action('confirm_register', handleConfirmRegister);
    bot.action('cancel_register', handleCancelRegister);

    // Handle inline button callbacks for unregistration confirmation
    bot.action('confirm_delete_account', handleConfirmDeleteAccount);
    bot.action('cancel_delete_account', handleCancelDeleteAccount);

    // Handle PDF export callback
    bot.action(/^export_pdf_(.+)$/, handleExportPdf);

    // Fallback handler for unrecognized messages (text, photos, voice notes, stickers, documents, etc.)
    // Placed after all command handlers so it only fires when nothing else matched
    bot.on('message', async (ctx) => {
        const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;

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
                `ការបញ្ជូលមិនត្រឹមត្រូវទម្រង់ សូមចុច /help ដើម្បីមើលអំពីរបៀបនៃការភ្ជាប់គណនី\nសូមអរគុណ!`
            );
        }
    });

    return bot;
}

module.exports = {
    createBot
};
