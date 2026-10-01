const puppeteer = require('puppeteer');
const { getKhmerPriority } = require('../utils');

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
 * Format dynamic Khmer date description text.
 * @param {Date|string} [startDate]
 * @param {Date|string} [endDate]
 * @returns {string}
 */
function formatKhmerDateText(startDate = new Date(), endDate = null) {
    const parse = (d) => {
        if (!d) return null;
        const date = new Date(d);
        if (isNaN(date.getTime())) return null;
        const day = date.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', day: '2-digit' });
        const month = date.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', month: '2-digit' });
        const year = date.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', year: 'numeric' });
        return { day, month, year };
    };

    const start = parse(startDate) || parse(new Date());
    if (endDate) {
        const end = parse(endDate);
        if (end) {
            return `ចាប់ពីថ្ងៃទី ${start.day} ខែ ${start.month} ឆ្នាំ ${start.year} ដល់ថ្ងៃទី ${end.day} ខែ ${end.month} ឆ្នាំ ${end.year}`;
        }
    }
    return `ថ្ងៃទី ${start.day} ខែ ${start.month} ឆ្នាំ ${start.year}`;
}

/**
 * Format priority with Khmer label and color using shared utils
 * @param {string} priorityName
 * @returns {string}
 */
function getPriorityBadge(priorityName) {
    if (!priorityName) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    const { label } = getKhmerPriority(priorityName);
    if (label === 'គ្មាន') {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    const colorMap = {
        'ខ្ពស់បំផុត': '#dc2626',
        'ខ្ពស់': '#ea580c',
        'មធ្យម': '#d97706',
        'ទាប': '#2563eb',
        'ទាបបំផុត': '#6b7280'
    };
    const color = colorMap[label] || '#475569';
    return `<span style="color: ${color}; font-weight: 600;">${escapeHtml(label)}</span>`;
}

/**
 * Format category / issue type with Khmer mapping
 * @param {Object|string} issueType
 * @returns {string}
 */
function getCategoryLabel(issueType) {
    if (!issueType) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    const typeName = typeof issueType === 'string' ? issueType : issueType.name;
    if (!typeName) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }

    const map = {
        'Task': 'កិច្ចការ',
        'Bug': 'កំហុស',
        'Story': 'រឿង',
        'Epic': 'Epic',
        'Sub-task': 'កិច្ចការរង',
        'Subtask': 'កិច្ចការរង'
    };

    const label = map[typeName] || typeName;
    return `<span>${escapeHtml(label)}</span>`;
}

/**
 * Format standard text value, showing "គ្មាន" if empty
 * @param {string} value
 * @returns {string}
 */
function formatText(value) {
    if (!value || typeof value !== 'string' || value.trim() === '') {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    return `<span>${escapeHtml(value)}</span>`;
}

/**
 * Format date string (YYYY-MM-DD), showing "គ្មាន" if empty
 * @param {string|Date} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
    if (!dateStr) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) {
            return `<span>${escapeHtml(dateStr)}</span>`;
        }
        const formatted = d.toISOString().slice(0, 10);
        return `<span>${escapeHtml(formatted)}</span>`;
    } catch {
        return `<span>${escapeHtml(dateStr)}</span>`;
    }
}

/**
 * Format due date with overdue indicator, showing "គ្មាន" if empty
 * @param {string} dueDate
 * @param {boolean} isDone
 * @returns {string}
 */
function formatDueDate(dueDate, isDone) {
    if (!dueDate) {
        return `<span style="color: #94a3b8;">គ្មាន</span>`;
    }
    const today = new Date().toISOString().slice(0, 10);
    const isOverdue = !isDone && dueDate < today;
    if (isOverdue) {
        return `<span style="color: #dc2626; font-weight: 600; background: #fee2e2; padding: 2px 4px; border-radius: 4px; display: inline-block;">⚠️ ហួសកំណត់ (${escapeHtml(dueDate)})</span>`;
    }
    return `<span>${escapeHtml(dueDate)}</span>`;
}

/**
 * Generate a PDF report for a list of Jira tasks.
 * @param {Array} issues Jira issues
 * @param {string} status 'To Do', 'In Progress', 'Done'
 * @param {Object} userMapping
 * @param {Object} [options={}] { startDate, endDate }
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateTaskReport(issues, status, userMapping, options = {}) {
    const baseUrl = process.env.JIRA_BASE_URL ? process.env.JIRA_BASE_URL.replace(/\/+$/, '') : '';
    const displayName = userMapping.display_name || userMapping.jira_email || 'Staff';
    const email = userMapping.jira_email || '';
    const isDone = status === 'Done';
    const today = new Date().toISOString().slice(0, 10);

    // 1. Identify all subtasks to deduplicate from top-level rendering
    const subtaskKeys = new Set();
    issues.forEach(issue => {
        (issue.fields?.subtasks || []).forEach(st => {
            if (st.key) subtaskKeys.add(st.key);
        });
    });

    // Create a map for quick subtask lookups (using issue data if full info provided)
    const issuesByKey = new Map();
    issues.forEach(issue => {
        if (issue.key) issuesByKey.set(issue.key, issue);
    });

    // 2. Filter top-level issues
    const topLevelIssues = issues.filter(issue => !subtaskKeys.has(issue.key));

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

    const khmerDateLine = formatKhmerDateText(options.startDate || now, options.endDate);

    let headerStatus = status;
    if (status === 'To Do') headerStatus = 'ត្រូវធ្វើ';
    else if (status === 'In Progress') headerStatus = 'កំពុងធ្វើ';
    else if (status === 'Done') headerStatus = 'បានធ្វើរួច';

    // Group top-level issues by project
    const groupedIssues = {};
    topLevelIssues.forEach(issue => {
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
        @import url('https://fonts.googleapis.com/css2?family=Moul&family=Noto+Sans+Khmer:wght@400;500;600;700&display=swap');

        * {
            box-sizing: border-box;
        }

        body {
            font-family: 'Noto Sans Khmer', 'Khmer OS', 'Segoe UI', Arial, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #1e293b;
            padding: 24px;
            margin: 0;
            background: #ffffff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .header {
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 8px;
            margin-bottom: 16px;
        }

        .letterhead {
            margin-bottom: 12px;
            font-family: 'Noto Sans Khmer', sans-serif;
        }

        .lh-kingdom {
            text-align: center;
            margin-bottom: 8px;
        }

        .lh-country {
            font-family: 'Moul', cursive;
            font-size: 16px;
            font-weight: normal;
            color: #0f172a;
        }

        .lh-motto {
            font-family: 'Moul', cursive;
            font-size: 14px;
            font-weight: normal;
            margin-top: 2px;
            color: #0f172a;
        }

        .lh-divider {
            font-size: 14px;
            margin: 4px 0 0 0;
            color: #0f172a;
        }

        .lh-ministry-block {
            text-align: left;
        }

        .lh-ministry {
            font-family: 'Moul', cursive;
            font-size: 14px;
            font-weight: normal;
            color: #0f172a;
        }

        .lh-dept {
            font-size: 12.5px;
            font-weight: 500;
            margin-top: 2px;
            color: #334155;
        }

        .lh-office {
            font-size: 12.5px;
            font-weight: 500;
            margin-top: 2px;
            color: #334155;
        }

        .title-block {
            text-align: center;
            margin-bottom: 16px;
        }

        .title-block h1 {
            font-family: 'Moul', cursive;
            font-size: 18px;
            font-weight: normal;
            margin: 0 0 4px 0;
            color: #0f172a;
        }

        .date-line {
            font-size: 13px;
            font-weight: 500;
            color: #475569;
        }

        .meta-box {
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-size: 12.5px;
            color: #475569;
            background: #f8fafc;
            padding: 10px 16px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
        }

        .meta-item {
            display: flex;
            align-items: center;
        }

        .meta-label {
            font-weight: 600;
            width: 120px;
            color: #334155;
        }

        .meta-value {
            flex: 1;
        }

        .project-section {
            margin-bottom: 24px;
            page-break-inside: avoid;
        }

        .project-title {
            font-size: 14px;
            font-weight: 700;
            background: #f1f5f9;
            color: #0f172a;
            padding: 6px 10px;
            border-radius: 4px;
            margin-bottom: 10px;
            border-left: 4px solid #3b82f6;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            table-layout: fixed;
        }

        th {
            background-color: #f8fafc;
            color: #334155;
            font-weight: 600;
            text-align: left;
            padding: 6px 6px;
            border-top: 1px solid #e2e8f0;
            border-bottom: 2px solid #cbd5e1;
            white-space: nowrap;
            vertical-align: bottom;
        }

        .en-header {
            display: block;
            font-size: 9px;
            font-weight: 500;
            color: #64748b;
            margin-top: 2px;
        }

        td {
            padding: 7px 6px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }

        tr:nth-child(even) {
            background-color: #fafbfc;
        }

        .col-num {
            width: 36px;
            text-align: center;
        }

        th.col-num {
            text-align: center;
        }

        .col-title {
            width: auto;
        }

        .col-category {
            width: 90px;
        }

        .col-priority {
            width: 85px;
        }

        .col-req-date {
            width: 95px;
        }

        .col-req-by {
            width: 105px;
        }

        .col-handle-by {
            width: 110px;
        }

        .col-due {
            width: 95px;
        }

        .col-resolved {
            width: 95px;
        }

        .issue-link {
            color: #1e293b;
            text-decoration: none;
            font-weight: 500;
        }

        .issue-link:hover {
            text-decoration: underline;
        }

        .subtask-row {
            background-color: #f8fafc !important;
        }

        .subtask-indent {
            padding-left: 14px;
            color: #475569;
        }

        .subtask-arrow {
            color: #94a3b8;
            font-weight: bold;
            margin-right: 4px;
        }

        .footer {
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #e2e8f0;
            font-size: 11px;
            color: #64748b;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="letterhead">
            <div class="lh-kingdom">
                <div class="lh-country">ព្រះរាជាណាចក្រកម្ពុជា</div>
                <div class="lh-motto">ជាតិ សាសនា ព្រះមហាក្សត្រ</div>
                <div class="lh-divider">——៚——</div>
            </div>
            <div class="lh-ministry-block">
                <!-- TODO: insert official seal image here -->
                <div class="lh-ministry">ក្រសួងសាធារណការ និងដឹកជញ្ជូន</div>
                <div class="lh-dept">អគ្គនាយកដ្ឋានបច្ចេកវិទ្យា និងទំនាក់ទំនងសាធារណៈ</div>
                <div class="lh-office">នាយកដ្ឋានប្រព័ន្ធបច្ចេកវិទ្យា</div>
            </div>
        </div>

        <div class="title-block">
            <h1>របាយការណ៍កិច្ចការ</h1>
            <div class="date-line">${escapeHtml(khmerDateLine)}</div>
        </div>

        <div class="meta-box">
            <div class="meta-item">
                <span class="meta-label">អ្នកទទួលបន្ទុក:</span>
                <span class="meta-value"><strong>${escapeHtml(displayName)}</strong> ${email ? `(${escapeHtml(email)})` : ''}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">ស្ថានភាព:</span>
                <span class="meta-value"><strong>${escapeHtml(headerStatus)}</strong></span>
            </div>
            <div class="meta-item">
                <span class="meta-label">ចំនួនកិច្ចការ:</span>
                <span class="meta-value"><strong>${issues.length}</strong> កិច្ចការ</span>
            </div>
        </div>
    </div>

    ${projectNames.map(proj => `
        <div class="project-section">
            <div class="project-title">${escapeHtml(proj)}</div>
            <table>
                <thead>
                    <tr>
                        <th class="col-num">ល.រ<span class="en-header">No</span></th>
                        <th class="col-title">ចំណងជើង<span class="en-header">Title</span></th>
                        <th class="col-category">ប្រភេទ<span class="en-header">Category</span></th>
                        <th class="col-priority">អាទិភាព<span class="en-header">Priority</span></th>
                        <th class="col-req-date">ថ្ងៃស្នើសុំ<span class="en-header">Request Date</span></th>
                        <th class="col-req-by">អ្នកស្នើសុំ<span class="en-header">Request By</span></th>
                        <th class="col-handle-by">អ្នកទទួលបន្ទុក<span class="en-header">Handle By</span></th>
                        <th class="col-due">ថ្ងៃកំណត់<span class="en-header">Due Date</span></th>
                        <th class="col-resolved">ថ្ងៃបញ្ចប់<span class="en-header">Resolved Date</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${groupedIssues[proj].map((issue, idx) => {
                        const issueKey = issue.key || '';
                        const summary = issue.fields?.summary || 'No summary';
                        const issueUrl = baseUrl ? `${baseUrl}/browse/${issueKey}` : '#';
                        const issueType = issue.fields?.issuetype;
                        const priorityName = issue.fields?.priority?.name;
                        const created = issue.fields?.created;
                        const reporter = issue.fields?.reporter?.displayName;
                        const assignee = issue.fields?.assignee?.displayName;
                        const dueDate = issue.fields?.duedate;
                        const resolutiondate = issue.fields?.resolutiondate;
                        const subtasks = issue.fields?.subtasks || [];

                        let rows = `
                            <tr>
                                <td class="col-num">${idx + 1}</td>
                                <td class="col-title">
                                    <a class="issue-link" href="${issueUrl}">${escapeHtml(summary)}</a>
                                </td>
                                <td class="col-category">${getCategoryLabel(issueType)}</td>
                                <td class="col-priority">${getPriorityBadge(priorityName)}</td>
                                <td class="col-req-date">${formatDate(created)}</td>
                                <td class="col-req-by">${formatText(reporter)}</td>
                                <td class="col-handle-by">${formatText(assignee)}</td>
                                <td class="col-due">${formatDueDate(dueDate, isDone)}</td>
                                <td class="col-resolved">${formatDate(resolutiondate)}</td>
                            </tr>
                        `;

                        if (subtasks && subtasks.length > 0) {
                            subtasks.forEach(subtask => {
                                const subKey = subtask.key || '';
                                const fullSubIssue = issuesByKey.get(subKey);
                                const subSummary = subtask.fields?.summary || fullSubIssue?.fields?.summary || 'No summary';
                                const subUrl = baseUrl ? `${baseUrl}/browse/${subKey}` : '#';
                                const subIssueType = subtask.fields?.issuetype || fullSubIssue?.fields?.issuetype || 'Sub-task';
                                const subPriority = subtask.fields?.priority?.name || fullSubIssue?.fields?.priority?.name;
                                const subCreated = subtask.fields?.created || fullSubIssue?.fields?.created;
                                const subReporter = subtask.fields?.reporter?.displayName || fullSubIssue?.fields?.reporter?.displayName;
                                const subAssignee = subtask.fields?.assignee?.displayName || fullSubIssue?.fields?.assignee?.displayName;
                                const subDueDate = subtask.fields?.duedate || fullSubIssue?.fields?.duedate;
                                const subResolutiondate = subtask.fields?.resolutiondate || fullSubIssue?.fields?.resolutiondate;

                                rows += `
                                    <tr class="subtask-row">
                                        <td class="col-num"></td>
                                        <td class="col-title subtask-indent">
                                            <span class="subtask-arrow">↳</span>
                                            <a class="issue-link" href="${subUrl}">${escapeHtml(subSummary)}</a>
                                        </td>
                                        <td class="col-category">${getCategoryLabel(subIssueType)}</td>
                                        <td class="col-priority">${getPriorityBadge(subPriority)}</td>
                                        <td class="col-req-date">${formatDate(subCreated)}</td>
                                        <td class="col-req-by">${formatText(subReporter)}</td>
                                        <td class="col-handle-by">${formatText(subAssignee)}</td>
                                        <td class="col-due">${formatDueDate(subDueDate, isDone)}</td>
                                        <td class="col-resolved">${formatDate(subResolutiondate)}</td>
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
        <span>ចំនួនកិច្ចការសរុប: <strong>${issues.length}</strong></span>
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
            landscape: true,
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

module.exports = {
    generateTaskReport,
    formatKhmerDateText,
    getCategoryLabel,
    getPriorityBadge,
    formatDueDate,
    formatDate,
    formatText
};
