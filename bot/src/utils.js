const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://jirabot.kaizenops.site').trim().replace(/\/+$/, '');

const ISSUE_TYPE_LABELS = {
    'Task': 'កិច្ចការ',
    'Bug': 'កំហុស',
    'Story': 'រឿង',
    'Epic': 'Epic',
    'Sub-task': 'កិច្ចការរង',
    'Subtask': 'កិច្ចការរង'
};

function getTodayDateString(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
}

function getKhmerPriority(priorityName) {
    if (!priorityName || priorityName.toLowerCase() === 'none') {
        return { emoji: '⚪', label: 'គ្មាន' };
    }

    const lower = priorityName.toLowerCase();

    // Exact or substring matches, ordered specifically to prevent 'highest' triggering 'high'
    if (lower.includes('highest')) return { emoji: '🔴', label: 'ខ្ពស់បំផុត' };
    if (lower.includes('high')) return { emoji: '🟠', label: 'ខ្ពស់' };
    if (lower.includes('medium')) return { emoji: '🟡', label: 'មធ្យម' };
    if (lower.includes('lowest')) return { emoji: '⚪', label: 'ទាបបំផុត' };
    if (lower.includes('low')) return { emoji: '🔵', label: 'ទាប' };

    return { emoji: '⚪', label: 'គ្មាន' };
}

/**
 * Get Khmer label for issue type:
 * Task -> កិច្ចការ, Sub-task -> កិច្ចការរង, Bug -> កំហុស, Story -> រឿង, Epic -> Epic
 * @param {Object|string} issueOrType Full issue object ({ fields: { issuetype } }) or issuetype object/string
 * @param {Object} [options={}]
 * @param {string|null} [options.fallback='កិច្ចការ'] Fallback when missing
 * @param {boolean} [options.checkSubtaskFlag=true] Whether issuetype.subtask boolean forces 'កិច្ចការរង'
 * @returns {string|null}
 */
function getIssueTypeLabel(issueOrType, options = {}) {
    const { fallback = 'កិច្ចការ', checkSubtaskFlag = true } = options;
    if (!issueOrType) return fallback;
    const issuetype = (typeof issueOrType === 'object' && 'fields' in issueOrType)
        ? issueOrType.fields?.issuetype
        : issueOrType;
    if (!issuetype) return fallback;
    if (checkSubtaskFlag && issuetype?.subtask) return 'កិច្ចការរង';
    const typeName = typeof issuetype === 'string' ? issuetype : issuetype?.name;
    if (!typeName) return fallback;
    return ISSUE_TYPE_LABELS[typeName] || typeName;
}

/**
 * Sort issues in-place by urgency:
 * 1. Overdue tasks first (duedate < today)
 * 2. Upcoming tasks (duedate >= today, soonest first)
 * 3. Tasks without a due date last
 * Tie-breaker: issue key alphabetical
 * @param {Array} issues
 * @param {string} [today=getTodayDateString()]
 * @returns {Array}
 */
function sortIssuesByUrgency(issues, today = getTodayDateString()) {
    if (!Array.isArray(issues)) return issues;
    return issues.sort((a, b) => {
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

/**
 * Format current date in Cambodia local time (UTC+7) as YYYYMMDD string.
 * @param {Date|string} [date=new Date()]
 * @returns {string} e.g. "20261005"
 */
function getCambodiaDateYMD(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', year: 'numeric' });
    const month = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', month: '2-digit' });
    const day = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', day: '2-digit' });
    return `${year}${month}${day}`;
}

/**
 * Build PDF export caption in format: {YYYYMMDD}_របាយការណ៍កិច្ចការ{status}{timeframe}
 * @param {string} status 'To Do', 'In Progress', 'Done', etc.
 * @param {string} [timeframe=''] optional timeframe or date range label to append
 * @param {Date|string} [date=new Date()] Date to format
 * @returns {string}
 */
function buildTaskReportCaption(status, timeframe = '', date = new Date()) {
    const statusMap = {
        'To Do': 'ត្រូវធ្វើ',
        'In Progress': 'កំពុងធ្វើ',
        'Done': 'បានធ្វើរួច',
        'All': 'ទាំងអស់',
        'ទាំងអស់': 'ទាំងអស់'
    };
    const statusKhmer = statusMap[status] || status;
    const ymd = getCambodiaDateYMD(date);
    return `${ymd}_របាយការណ៍កិច្ចការ${statusKhmer}${timeframe}`;
}

// Basic markdown escaper for common characters that could break parsing
function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Escape HTML special characters for Telegram HTML parse mode.
 * Escapes &, <, and >.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Escape HTML attribute values (href, etc.).
 * @param {string} text
 * @returns {string}
 */
function escapeAttr(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

module.exports = {
    PUBLIC_BASE_URL,
    ISSUE_TYPE_LABELS,
    getTodayDateString,
    getCambodiaDateYMD,
    buildTaskReportCaption,
    getKhmerPriority,
    getIssueTypeLabel,
    sortIssuesByUrgency,
    escapeMarkdown,
    escapeHtml,
    escapeAttr
};
