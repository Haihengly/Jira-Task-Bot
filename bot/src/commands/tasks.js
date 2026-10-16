const jiraClient = require('../jira/client');
const { getMappingByTelegramId } = require('../db/mappings');
const {
    getTodayDateString,
    getCambodiaDateYMD,
    formatPriorityAndDue,
    escapeMarkdown,
    escapeHtml,
    escapeAttr,
    getKhmerPriority,
    buildTaskReportCaption
} = require('../utils');
const {
    getRegisteredKeyboard,
    getTasksKeyboard,
    getPdfStatusKeyboard,
    getPdfHubKeyboard
} = require('../utils/commands');
const {
    USER_MODES,
    setUserMode,
    getUserMode,
    clearUserMode
} = require('../utils/userState');
const { generateTaskReport, generateMultiSectionReport, KHMER_MONTH_NAMES } = require('../pdf/generateTaskReport');

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
 * Handle "📊 តាមស្ថានភាព" button from PDF Hub
 */
async function handlePdfByStatus(ctx) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    setUserMode(telegramUserId, USER_MODES.PDF_STATUS);

    return ctx.reply(
        'សូមជ្រើសរើសប្រភេទកិច្ចការសម្រាប់ទាញយកជា PDF៖',
        getPdfStatusKeyboard()
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
        const dateStr = getCambodiaDateYMD();
        const filename = `Jira_Tasks_${statusClean}_${dateStr}.pdf`;

        const caption = buildTaskReportCaption(status);

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
 * Export all tasks (To Do, In Progress, Done) in a single multi-section PDF report
 */
async function exportAllTasksPdf(ctx) {
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

        const [todoIssues, inProgressIssues, doneIssues] = await Promise.all([
            jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, 'To Do'),
            jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, 'In Progress'),
            jiraClient.getIssuesByAssigneeAndStatus(mapping.jira_account_id, 'Done')
        ]);

        const totalCount = (todoIssues?.length || 0) + (inProgressIssues?.length || 0) + (doneIssues?.length || 0);
        console.log(`[PDF Export All] Issues fetched for ${mapping.jira_email || mapping.jira_account_id}: To Do = ${todoIssues?.length || 0}, In Progress = ${inProgressIssues?.length || 0}, Done = ${doneIssues?.length || 0} (Total: ${totalCount})`);

        if (totalCount === 0) {
            if (statusMsg) {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
            }
            return ctx.reply('មិនមានកិច្ចការសម្រាប់ទាញយកជា PDF នោះទេ។');
        }

        const sections = [
            { status: 'To Do', issues: todoIssues || [] },
            { status: 'In Progress', issues: inProgressIssues || [] },
            { status: 'Done', issues: doneIssues || [] }
        ];

        const rawPdf = await generateMultiSectionReport(sections, mapping);
        const pdfBuffer = Buffer.from(rawPdf);

        const dateStr = getCambodiaDateYMD();
        const filename = `Jira_Tasks_All_${dateStr}.pdf`;

        const caption = buildTaskReportCaption('All');

        await ctx.replyWithDocument(
            { source: pdfBuffer, filename },
            { caption }
        );

        if (statusMsg) {
            await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
        }
    } catch (error) {
        console.error('Error exporting All tasks PDF:', error);
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
 * Format due date in Khmer: <day> <Khmer month>
 * Reuses KHMER_MONTH_NAMES from the PDF code.
 * @param {string} dueDateStr 'YYYY-MM-DD'
 * @returns {string|null} e.g. "25 តុលា" or null
 */
function formatKhmerDueDate(dueDateStr) {
    if (!dueDateStr) return null;
    const parts = dueDateStr.split('-');
    if (parts.length < 3) return null;
    const day = parseInt(parts[2], 10);
    const month = parseInt(parts[1], 10);
    if (isNaN(day) || isNaN(month) || month < 1 || month > 12) return null;
    const monthName = KHMER_MONTH_NAMES[month - 1];
    return `${day} ${monthName}`;
}

/**
 * Format priority and due date line for code block (<pre>):
 * priority emoji + Khmer label | ថ្ងៃកំណត់៖ <day> <Khmer month>, plus ⚠️ ផុតកំណត់ if overdue, or គ្មាន if no due date.
 * @param {string} priorityName
 * @param {string} dueDate
 * @param {string} today
 * @returns {string}
 */
function formatTaskPriorityAndDue(priorityName, dueDate, today) {
    const { emoji, label } = getKhmerPriority(priorityName);
    const formattedDue = formatKhmerDueDate(dueDate);
    let dueText = '';
    if (formattedDue) {
        const isOverdue = dueDate && dueDate < today;
        dueText = ` | ថ្ងៃកំណត់៖ ${formattedDue}${isOverdue ? ' ⚠️ ផុតកំណត់' : ''}`;
    } else {
        dueText = ` | ថ្ងៃកំណត់៖ គ្មាន`;
    }
    return `${emoji} ${label}${dueText}`;
}

/**
 * Get Khmer label for issue type:
 * Task -> កិច្ចការ, Sub-task -> កិច្ចការរង, Bug -> កំហុស, Story -> រឿង, Epic -> Epic
 * @param {Object} issue
 * @returns {string}
 */
function getIssueTypeLabel(issue) {
    const issuetype = issue.fields?.issuetype;
    if (issuetype?.subtask) return 'កិច្ចការរង';
    const typeName = typeof issuetype === 'string' ? issuetype : issuetype?.name;
    const map = {
        'Task': 'កិច្ចការ',
        'Bug': 'កំហុស',
        'Story': 'រឿង',
        'Epic': 'Epic',
        'Sub-task': 'កិច្ចការរង',
        'Subtask': 'កិច្ចការរង'
    };
    return (typeName && map[typeName]) ? map[typeName] : (typeName || 'កិច្ចការ');
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
        const fields = 'summary,status,assignee,priority,duedate,project,subtasks,issuetype';

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

        const header = `📋 <b>កិច្ចការ${headerStatus}</b> (${issues.length}):\nចុចលើប្រភេទកិច្ចការ ដើម្បីបើកក្នុង Jira\n`;

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

        // Build list of message chunks (keeping each under 4096-character limit)
        const MAX_MSG_LENGTH = 3800;
        const messages = [];
        let currentMsg = header;

        sortedProjectNames.forEach(projectName => {
            const projectIssues = groupedIssues[projectName];
            const projectHeader = `\n🗂 <b>${escapeHtml(projectName)}</b>\n\n`;

            if (currentMsg.length + projectHeader.length > MAX_MSG_LENGTH && currentMsg.trim().length > 0) {
                messages.push(currentMsg.trim());
                currentMsg = projectHeader;
            } else {
                currentMsg += projectHeader;
            }

            // Map all issues by key
            const issuesByKey = new Map();
            projectIssues.forEach(issue => {
                if (issue.key) issuesByKey.set(issue.key, issue);
            });

            // Identify all subtask keys within this project
            const subtaskKeys = new Set();
            projectIssues.forEach(issue => {
                (issue.fields?.subtasks || []).forEach(st => {
                    if (st.key) subtaskKeys.add(st.key);
                });
            });

            // Filter top-level issues
            const topLevelIssues = projectIssues.filter(issue => !subtaskKeys.has(issue.key));

            if (isDone) {
                // Sort alphabetically by issue key
                topLevelIssues.sort((a, b) => (a.key || '').localeCompare(b.key || ''));
            } else {
                // Sort by urgency:
                // 1. Overdue tasks first (duedate < today)
                // 2. Upcoming tasks (duedate >= today, soonest first)
                // 3. Tasks without a due date last
                // Tie-breaker: issue key alphabetical
                topLevelIssues.sort((a, b) => {
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
            }

            topLevelIssues.forEach((issue, idx) => {
                const parentIdx = idx + 1;
                const issueKey = issue.key || '';
                const summary = issue.fields?.summary || 'No summary';
                const issueUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : '#';
                const typeLabel = getIssueTypeLabel(issue);

                let preContent = escapeHtml(summary);
                if (!isDone) {
                    const priorityName = issue.fields?.priority?.name || 'None';
                    const dueDate = issue.fields?.duedate;
                    const priorityAndDueText = formatTaskPriorityAndDue(priorityName, dueDate, today);
                    preContent += `\n${priorityAndDueText}`;
                }

                const taskBlock = `${parentIdx}. <a href="${escapeAttr(issueUrl)}">${escapeHtml(typeLabel)}</a> ៖\n<pre>${preContent}</pre>\n\n`;

                if (currentMsg.length + taskBlock.length > MAX_MSG_LENGTH && currentMsg.trim().length > 0) {
                    messages.push(currentMsg.trim());
                    currentMsg = taskBlock;
                } else {
                    currentMsg += taskBlock;
                }

                // Render subtasks under this parent
                const rawSubtasks = (issue.fields?.subtasks || []).map(st => {
                    return issuesByKey.get(st.key) || st;
                }).filter(st => {
                    const stStatus = st.fields?.status?.name;
                    if (stStatus && stStatus !== status) {
                        return false;
                    }
                    return true;
                });

                if (rawSubtasks.length > 0) {
                    if (isDone) {
                        rawSubtasks.sort((a, b) => (a.key || '').localeCompare(b.key || ''));
                    } else {
                        rawSubtasks.sort((a, b) => {
                            const dueA = a.fields?.duedate;
                            const dueB = b.fields?.duedate;
                            const getCat = (due) => {
                                if (!due) return 3;
                                if (due < today) return 1;
                                return 2;
                            };
                            const catA = getCat(dueA);
                            const catB = getCat(dueB);
                            if (catA !== catB) return catA - catB;
                            if (dueA && dueB) return dueA.localeCompare(dueB);
                            return (a.key || '').localeCompare(b.key || '');
                        });
                    }

                    rawSubtasks.forEach((subtask, sIdx) => {
                        const subIdx = sIdx + 1;
                        const subKey = subtask.key || '';
                        const subSummary = subtask.fields?.summary || 'No summary';
                        const subUrl = baseUrl ? `${baseUrl}/browse/${subKey}` : '#';
                        const subTypeLabel = getIssueTypeLabel(subtask);

                        let subPreContent = escapeHtml(subSummary);
                        if (!isDone) {
                            const subPriority = subtask.fields?.priority?.name || 'None';
                            const subDueDate = subtask.fields?.duedate;
                            const subPriorityAndDue = formatTaskPriorityAndDue(subPriority, subDueDate, today);
                            subPreContent += `\n${subPriorityAndDue}`;
                        }

                        const subtaskBlock = `${parentIdx}.${subIdx} <a href="${escapeAttr(subUrl)}">${escapeHtml(subTypeLabel)}</a> ៖\n<pre>${subPreContent}</pre>\n\n`;

                        if (currentMsg.length + subtaskBlock.length > MAX_MSG_LENGTH && currentMsg.trim().length > 0) {
                            messages.push(currentMsg.trim());
                            currentMsg = subtaskBlock;
                        } else {
                            currentMsg += subtaskBlock;
                        }
                    });
                }
            });
        });

        if (currentMsg.trim().length > 0) {
            messages.push(currentMsg.trim());
        }

        for (const msg of messages) {
            await ctx.reply(msg, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
        }
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
    handlePdfByStatus,
    handlePdfToday: handlePdfByStatus,
    handlePdfAll: handlePdfByStatus,
    handlePdfDateRange,
    handleStatusSelection,
    handleBackNavigation,
    exportAllTasksPdf,
    handleExportPdf
};
