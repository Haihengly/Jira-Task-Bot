const puppeteer = require('puppeteer');

/**
 * Escape HTML special characters
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Format priority with Khmer label and color
 * @param {string} priorityName
 * @returns {string}
 */
function getPriorityBadge(priorityName) {
    const name = (priorityName || '').toLowerCase();
    switch (name) {
        case 'highest':
            return `<span style="color: #dc2626; font-weight: 600;">🔴 ខ្ពស់បំផុត (Highest)</span>`;
        case 'high':
            return `<span style="color: #ea580c; font-weight: 600;">🟠 ខ្ពស់ (High)</span>`;
        case 'medium':
            return `<span style="color: #d97706; font-weight: 600;">🟡 មធ្យម (Medium)</span>`;
        case 'low':
            return `<span style="color: #2563eb; font-weight: 600;">🔵 ទាប (Low)</span>`;
        case 'lowest':
            return `<span style="color: #6b7280; font-weight: 500;">⚪ ទាបបំផុត (Lowest)</span>`;
        default:
            return `<span style="color: #9ca3af;">⚪ គ្មាន (None)</span>`;
    }
}

/**
 * Format due date with overdue indicator
 * @param {string} dueDate
 * @param {boolean} isDone
 * @returns {string}
 */
function formatDueDate(dueDate, isDone) {
    if (!dueDate) {
        return `<span style="color: #94a3b8;">-</span>`;
    }
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = !isDone && dueDate < today;
    if (isOverdue) {
        return `<span style="color: #dc2626; font-weight: 600; background: #fee2e2; padding: 2px 6px; border-radius: 4px; display: inline-block;">⚠️ ហួសកំណត់ (${escapeHtml(dueDate)})</span>`;
    }
    return `<span>${escapeHtml(dueDate)}</span>`;
}

/**
 * Generate a PDF report for a list of Jira tasks.
 * @param {Array} issues Jira issues
 * @param {string} status 'To Do', 'In Progress', 'Done'
 * @param {Object} userMapping
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateTaskReport(issues, status, userMapping) {
    const baseUrl = process.env.JIRA_BASE_URL ? process.env.JIRA_BASE_URL.replace(/\/+$/, '') : '';
    const displayName = userMapping.display_name || userMapping.jira_email || 'Staff';
    const email = userMapping.jira_email || '';
    const isDone = status === 'Done';
    const today = new Date().toISOString().slice(0, 10);

    const now = new Date();
    const formattedDate = now.toLocaleString('en-US', {
        timeZone: 'Asia/Phnom_Penh',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) + ' (UTC+7)';

    let headerStatus = status;
    if (status === 'To Do') headerStatus = 'ត្រូវធ្វើ (To Do)';
    else if (status === 'In Progress') headerStatus = 'កំពុងធ្វើ (In Progress)';
    else if (status === 'Done') headerStatus = 'បានធ្វើរួច (Done)';

    // Group issues by project
    const groupedIssues = {};
    issues.forEach(issue => {
        const projectName = issue.fields?.project?.name || 'Unknown Project';
        if (!groupedIssues[projectName]) {
            groupedIssues[projectName] = [];
        }
        groupedIssues[projectName].push(issue);
    });

    const projectNames = Object.keys(groupedIssues).sort((a, b) => a.localeCompare(b));

    // Sort issues within each project group by urgency
    projectNames.forEach(proj => {
        const projectIssues = groupedIssues[proj];
        if (isDone) {
            projectIssues.sort((a, b) => (a.key || '').localeCompare(b.key || ''));
        } else {
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
        }
    });

    const html = `
<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <title>របាយការណ៍កិច្ចការ</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Khmer:wght@400;500;600;700&display=swap');

        * {
            box-sizing: border-box;
        }

        body {
            font-family: 'Noto Sans Khmer', 'Khmer OS', 'Segoe UI', Arial, sans-serif;
            font-size: 13px;
            line-height: 1.5;
            color: #1e293b;
            padding: 24px;
            margin: 0;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .header {
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 16px;
            margin-bottom: 24px;
        }

        .header h1 {
            font-size: 22px;
            margin: 0 0 10px 0;
            color: #0f172a;
            display: flex;
            align-items: center;
        }

        .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 16px;
            font-size: 13px;
            color: #475569;
        }

        .meta-item {
            display: flex;
        }

        .meta-label {
            font-weight: 600;
            width: 140px;
            color: #334155;
        }

        .meta-value {
            flex: 1;
        }

        .project-section {
            margin-bottom: 28px;
            page-break-inside: avoid;
        }

        .project-title {
            font-size: 15px;
            font-weight: 700;
            background: #f1f5f9;
            color: #0f172a;
            padding: 8px 12px;
            border-radius: 6px;
            margin-bottom: 12px;
            border-left: 4px solid #3b82f6;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12.5px;
            table-layout: fixed;
        }

        th {
            background-color: #f8fafc;
            color: #475569;
            font-weight: 600;
            text-align: left;
            padding: 9px 10px;
            border-top: 1px solid #e2e8f0;
            border-bottom: 2px solid #cbd5e1;
        }

        td {
            padding: 9px 10px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        tr:nth-child(even) {
            background-color: #fafbfc;
        }

        .col-num {
            width: 35px;
            text-align: center;
        }

        .col-title {
            width: auto;
        }

        .col-priority {
            width: 145px;
        }

        .col-due {
            width: 140px;
        }

        .issue-link {
            color: #0284c7;
            text-decoration: none;
            font-weight: 600;
        }

        .issue-link:hover {
            text-decoration: underline;
        }

        .subtask-row {
            background-color: #f8fafc !important;
        }

        .subtask-indent {
            padding-left: 20px;
            color: #475569;
        }

        .subtask-arrow {
            color: #94a3b8;
            font-weight: bold;
            margin-right: 4px;
        }

        .footer {
            margin-top: 36px;
            padding-top: 12px;
            border-top: 1px solid #e2e8f0;
            font-size: 11.5px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 របាយការណ៍កិច្ចការ (Task Report)</h1>
        <div class="meta-grid">
            <div class="meta-item">
                <span class="meta-label">បុគ្គលិក (Staff):</span>
                <span class="meta-value"><strong>${escapeHtml(displayName)}</strong> ${email ? `(${escapeHtml(email)})` : ''}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">ស្ថានភាព (Status):</span>
                <span class="meta-value"><strong>${escapeHtml(headerStatus)}</strong></span>
            </div>
            <div class="meta-item">
                <span class="meta-label">កាលបរិច្ឆេទ (Date):</span>
                <span class="meta-value">${escapeHtml(formattedDate)}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">ចំនួនកិច្ចការ (Tasks):</span>
                <span class="meta-value"><strong>${issues.length}</strong> កិច្ចការ</span>
            </div>
        </div>
    </div>

    ${projectNames.map(proj => `
        <div class="project-section">
            <div class="project-title">🗂 ${escapeHtml(proj)} (${groupedIssues[proj].length})</div>
            <table>
                <thead>
                    <tr>
                        <th class="col-num">#</th>
                        <th class="col-title">ចំណងជើង (Title)</th>
                        <th class="col-priority">អាទិភាព (Priority)</th>
                        <th class="col-due">ថ្ងៃកំណត់ (Due Date)</th>
                    </tr>
                </thead>
                <tbody>
                    ${groupedIssues[proj].map((issue, idx) => {
                        const issueKey = issue.key || '';
                        const summary = issue.fields?.summary || 'No summary';
                        const issueUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : '#';
                        const priorityName = issue.fields?.priority?.name || 'None';
                        const dueDate = issue.fields?.duedate;
                        const subtasks = issue.fields?.subtasks || [];

                        let rows = `
                            <tr>
                                <td class="col-num">${idx + 1}</td>
                                <td class="col-title">
                                    <a class="issue-link" href="${issueUrl}">[${escapeHtml(issueKey)}]</a> ${escapeHtml(summary)}
                                </td>
                                <td class="col-priority">${getPriorityBadge(priorityName)}</td>
                                <td class="col-due">${formatDueDate(dueDate, isDone)}</td>
                            </tr>
                        `;

                        if (subtasks && subtasks.length > 0) {
                            subtasks.forEach(subtask => {
                                const subKey = subtask.key || '';
                                const subSummary = subtask.fields?.summary || 'No summary';
                                const subUrl = baseUrl ? `${baseUrl}/browse/${subKey}` : '#';
                                const subPriority = subtask.fields?.priority?.name || 'None';

                                rows += `
                                    <tr class="subtask-row">
                                        <td class="col-num"></td>
                                        <td class="col-title subtask-indent">
                                            <span class="subtask-arrow">↳</span>
                                            <a class="issue-link" href="${subUrl}">[${escapeHtml(subKey)}]</a> ${escapeHtml(subSummary)}
                                        </td>
                                        <td class="col-priority">${getPriorityBadge(subPriority)}</td>
                                        <td class="col-due"><span style="color: #94a3b8;">-</span></td>
                                    </tr>
                                `;
                            });
                        }

                        return rows;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `).join('')}

    <div class="footer">
        <span>ចំនួនកិច្ចការសរុប (Total Tasks): <strong>${issues.length}</strong></span>
        <span>បង្កើតដោយ Jira Task Bot</span>
    </div>
</body>
</html>
`;

    const browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--font-render-hinting=none'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
            timeout: 30000
        });

        const pdfResult = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: {
                top: '15mm',
                bottom: '15mm',
                left: '12mm',
                right: '12mm'
            }
        });

        return Buffer.from(pdfResult);
    } finally {
        await browser.close();
    }
}

module.exports = { generateTaskReport };
