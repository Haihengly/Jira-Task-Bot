const jiraClient = require('../jira/client');
const { getMappingByTelegramId } = require('../db/mappings');
const { getTodayDateString, formatPriorityAndDue, escapeMarkdown, buildTaskReportCaption } = require('../utils');
const {
    getRegisteredKeyboard,
    getTasksKeyboard,
    getPdfHubKeyboard
} = require('../utils/commands');
const {
    USER_MODES,
    setUserMode,
    getUserMode,
    clearUserMode
} = require('../utils/userState');
const { generateTaskReport } = require('../pdf/generateTaskReport');

/**
 * Handle /mytasks command or "📋 កិច្ចការរបស់ខ្ញុំ" button
 */
async function handleMyTasks(ctx) {
    if (ctx.payload && ctx.payload.trim().length > 0) {
        return ctx.reply('⚠️ សូមប្រើ /mytasks ដោយគ្មានអក្សរផ្សេងទៀតនៅពីក្រោយ។');
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    setUserMode(telegramUserId, USER_MODES.TEXT_TASKS);

    return ctx.reply(
        'សូមជ្រើសរើសប្រភេទកិច្ចការដែលអ្នកចង់មើល៖',
        getTasksKeyboard()
    );
}

/**
 * Handle /export command or "📄 នាំចេញជា PDF" button from root registered keyboard
 */
async function handlePdfHub(ctx) {
    if (ctx.payload && ctx.payload.trim().length > 0) {
        return ctx.reply('⚠️ សូមប្រើ /export ដោយគ្មានអក្សរផ្សេងទៀតនៅពីក្រោយ។');
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    setUserMode(telegramUserId, USER_MODES.PDF_HUB);

    return ctx.reply(
        'សូមជ្រើសរើសជម្រើសនៃការនាំចេញជា PDF៖',
        getPdfHubKeyboard()
    );
}

/**
 * Handle "📊 ថ្ងៃនេះ" button from PDF Hub
 */
async function handlePdfToday(ctx) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    setUserMode(telegramUserId, USER_MODES.PDF_STATUS);

    return ctx.reply(
        'សូមជ្រើសរើសប្រភេទកិច្ចការសម្រាប់ទាញយកជា PDF៖',
        getTasksKeyboard()
    );
}

/**
 * Handle "📅 ចន្លោះកាលបរិច្ឆេទ" button (placeholder)
 */
async function handlePdfDateRange(ctx) {
    return ctx.reply('🚧 មុខងារនេះកំពុងសាងសង់ សូមរង់ចាំពេលក្រោយ។');
}

/**
 * Handle back button navigation based on active user mode
 */
async function handleBackNavigation(ctx) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const mode = getUserMode(telegramUserId);

    if (mode === USER_MODES.PDF_STATUS) {
        // Go back from PDF status picker to PDF Hub
        setUserMode(telegramUserId, USER_MODES.PDF_HUB);
        return ctx.reply('បានត្រឡប់ទៅកាន់ PDF Hub វិញ', getPdfHubKeyboard());
    }

    // Go back to root registered keyboard
    clearUserMode(telegramUserId);
    return ctx.reply('បានត្រឡប់ទៅកាន់ម៉ឺនុយដើមវិញ', getRegisteredKeyboard());
}

/**
 * Export PDF directly for status button press in PDF mode
 */
async function exportTaskPdfDirectly(ctx, status) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (!telegramUserId) {
        return ctx.reply('Unable to read your Telegram user ID.');
    }

    let statusMsg = null;
    try {
        await ctx.sendChatAction('upload_document');
        statusMsg = await ctx.reply('កំពុងបង្កើត PDF... សូមរង់ចាំបន្តិច។');

        const mapping = await getMappingByTelegramId(telegramUserId);
        if (!mapping || !mapping.jira_account_id) {
            if (statusMsg) {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
            }
            return ctx.reply('សូមភ្ជាប់គណនី Jira របស់អ្នកជាមុនសិន ដោយប្រើ /link');
        }

        const issues = await jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, status);

        if (!issues || issues.length === 0) {
            if (statusMsg) {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
            }
            let emptyMessage = '';
            if (status === 'To Do') emptyMessage = 'មិនមានកិច្ចការត្រូវធ្វើសម្រាប់ទាញយកជា PDF នោះទេ។';
            else if (status === 'In Progress') emptyMessage = 'មិនមានកិច្ចការកំពុងធ្វើសម្រាប់ទាញយកជា PDF នោះទេ។';
            else if (status === 'Done') emptyMessage = 'មិនមានកិច្ចការដែលបានធ្វើរួចសម្រាប់ទាញយកជា PDF នោះទេ។ 👍';
            return ctx.reply(emptyMessage);
        }

        const rawPdf = await generateTaskReport(issues, status, mapping);
        const pdfBuffer = Buffer.from(rawPdf);

        const statusClean = status.replace(/\s+/g, '_');
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `Jira_Tasks_${statusClean}_${dateStr}.pdf`;

        const caption = buildTaskReportCaption(status, 'ថ្ងៃនេះ');

        await ctx.replyWithDocument(
            { source: pdfBuffer, filename },
            { caption }
        );

        if (statusMsg) {
            await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
        }
    } catch (error) {
        console.error(`Error exporting PDF for status "${status}":`, error);
        if (statusMsg) {
            await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
        }
        return ctx.reply('មានបញ្ហាក្នុងការបង្កើត PDF។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។');
    }
}

/**
 * Route status button press to either plain-text task view or direct PDF export
 */
async function handleStatusSelection(ctx, status) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const mode = getUserMode(telegramUserId);

    if (mode === USER_MODES.PDF_STATUS) {
        return exportTaskPdfDirectly(ctx, status);
    }

    return handleTasks(ctx, status);
}

/**
 * Handle plain-text tasks display
 */
async function handleTasks(ctx, status) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;

    if (!telegramUserId) {
        return ctx.reply('Unable to read your Telegram user ID.');
    }

    try {
        const mapping = await getMappingByTelegramId(telegramUserId);

        if (!mapping || !mapping.jira_account_id) {
            return ctx.reply(
                'អ្នកមិនទាន់បានចុះឈ្មោះគណនី Jira របស់អ្នកនៅឡើយទេ!\n' +
                'សូមប្រើ /link ដើម្បីភ្ជាប់គណនីរបស់អ្នកជាមុនសិន។'
            );
        }

        const isDone = status === 'Done';
        const fields = isDone ? 'summary,project,subtasks' : 'summary,status,assignee,priority,duedate,project,subtasks';

        const issues = await jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, status, fields);

        if (!issues || issues.length === 0) {
            let emptyMessage = '';
            if (status === 'To Do') emptyMessage = 'មិនទាន់មានកិច្ចការត្រូវធ្វើនោះទេ។';
            else if (status === 'In Progress') emptyMessage = 'មិនទាន់មានកិច្ចការកំពុងធ្វើនោះទេ។';
            else if (status === 'Done') emptyMessage = 'មិនទាន់មានកិច្ចការដែលបានធ្វើរួចនោះទេ។ 👍';

            return ctx.reply(emptyMessage);
        }

        const baseUrl = process.env.JIRA_BASE_URL ? process.env.JIRA_BASE_URL.replace(/\/+$/, '') : '';

        // Khmer headers
        let headerStatus = status;
        if (status === 'To Do') headerStatus = 'ត្រូវធ្វើ';
        else if (status === 'In Progress') headerStatus = 'កំពុងធ្វើ';
        else if (status === 'Done') headerStatus = 'បានធ្វើរួច';

        let message = `📋 *កិច្ចការ${headerStatus}* (${issues.length}):\n`;

        // Group issues by project name
        const groupedIssues = {};
        issues.forEach(issue => {
            const projectName = issue.fields?.project?.name || 'Unknown Project';
            if (!groupedIssues[projectName]) {
                groupedIssues[projectName] = [];
            }
            groupedIssues[projectName].push(issue);
        });

        // Sort project names alphabetically
        const sortedProjectNames = Object.keys(groupedIssues).sort((a, b) => a.localeCompare(b));

        const today = isDone ? null : getTodayDateString();

        sortedProjectNames.forEach(projectName => {
            const projectIssues = groupedIssues[projectName];

            message += `\n🗂 *${escapeMarkdown(projectName)}*\n\n`;

            if (isDone) {
                // Sort alphabetically by issue key
                projectIssues.sort((a, b) => (a.key || '').localeCompare(b.key || ''));

                projectIssues.forEach((issue) => {
                    const issueKey = issue.key;
                    const summary = issue.fields?.summary || 'No summary';
                    const issueUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : '#';

                    message += `[${issueKey}](${issueUrl}): ${escapeMarkdown(summary)}\n\n`;
                });
            } else {
                // Sort by urgency:
                // 1. Overdue tasks first (duedate < today)
                // 2. Upcoming tasks (duedate >= today, soonest first)
                // 3. Tasks without a due date last
                projectIssues.sort((a, b) => {
                    const dueA = a.fields?.duedate;
                    const dueB = b.fields?.duedate;

                    const getCategory = (due) => {
                        if (!due) return 3;
                        if (due < today) return 1;
                        return 2;
                    };

                    const catA = getCategory(dueA);
                    const catB = getCategory(dueB);

                    if (catA !== catB) {
                        return catA - catB;
                    }

                    if (dueA && dueB) {
                        return dueA.localeCompare(dueB);
                    }

                    return (a.key || '').localeCompare(b.key || '');
                });

                projectIssues.forEach((issue) => {
                    const issueKey = issue.key;
                    const summary = issue.fields?.summary || 'No summary';
                    const issueUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : '#';

                    const priorityName = issue.fields?.priority?.name || 'None';
                    const dueDate = issue.fields?.duedate;
                    const priorityAndDueText = formatPriorityAndDue(priorityName, dueDate, {
                        withPriorityLabel: true,
                        alwaysShowDueDate: true,
                        today
                    });

                    message += `[${issueKey}](${issueUrl}): ${escapeMarkdown(summary)}\n`;
                    message += `   ${priorityAndDueText}\n\n`;
                });
            }
        });

        return ctx.replyWithMarkdown(message, {
            disable_web_page_preview: true
        });
    } catch (error) {
        console.error(`Error handling task command for status "${status}":`, error);
        return ctx.reply('An error occurred while fetching your Jira tasks. Please try again later.');
    }
}

/**
 * Handle callback query for export_pdf inline button (kept for backwards compatibility)
 */
async function handleExportPdf(ctx) {
    const match = ctx.match;
    const status = match ? match[1] : null;

    if (!status) {
        return ctx.answerCbQuery('Status not found.').catch(() => {});
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (!telegramUserId) {
        return ctx.answerCbQuery('User ID not found.').catch(() => {});
    }

    try {
        await ctx.answerCbQuery('កំពុងបង្កើត PDF... (Generating PDF...)');
        await ctx.sendChatAction('upload_document');

        const mapping = await getMappingByTelegramId(telegramUserId);
        if (!mapping || !mapping.jira_account_id) {
            return ctx.reply('សូមភ្ជាប់គណនី Jira របស់អ្នកជាមុនសិន ដោយប្រើ /link');
        }

        const fields = 'summary,status,assignee,priority,duedate,project,subtasks';
        const issues = await jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, status, fields);

        if (!issues || issues.length === 0) {
            return ctx.reply('មិនមានកិច្ចការសម្រាប់ទាញយកជា PDF នោះទេ។');
        }

        const rawPdf = await generateTaskReport(issues, status, mapping);
        const pdfBuffer = Buffer.from(rawPdf);

        const statusClean = status.replace(/\s+/g, '_');
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `Jira_Tasks_${statusClean}_${dateStr}.pdf`;

        let headerStatus = status;
        if (status === 'To Do') headerStatus = 'ត្រូវធ្វើ (To Do)';
        else if (status === 'In Progress') headerStatus = 'កំពុងធ្វើ (In Progress)';
        else if (status === 'Done') headerStatus = 'បានធ្វើរួច (Done)';

        return ctx.replyWithDocument(
            { source: pdfBuffer, filename },
            { caption: `📄 របាយការណ៍កិច្ចការ: ${headerStatus}` }
        );
    } catch (error) {
        console.error('Error exporting PDF:', error);
        return ctx.reply('មានបញ្ហាក្នុងការបង្កើត PDF។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។');
    }
}

module.exports = {
    handleTasks,
    handleMyTasks,
    handlePdfHub,
    handlePdfToday,
    handlePdfDateRange,
    handleStatusSelection,
    handleBackNavigation,
    handleExportPdf
};
