// In-memory user navigation mode tracking: telegramUserId -> mode
const userModes = new Map();

const USER_MODES = {
    TEXT_TASKS: 'text_tasks',
    PDF_HUB: 'pdf_hub',
    PDF_STATUS: 'pdf_status'
};

function setUserMode(telegramUserId, mode) {
    if (!telegramUserId) return;
    userModes.set(String(telegramUserId), mode);
}

function getUserMode(telegramUserId) {
    if (!telegramUserId) return null;
    return userModes.get(String(telegramUserId)) || null;
}

function clearUserMode(telegramUserId) {
    if (!telegramUserId) return;
    userModes.delete(String(telegramUserId));
}

module.exports = {
    USER_MODES,
    setUserMode,
    getUserMode,
    clearUserMode
};
