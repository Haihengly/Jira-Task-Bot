const crypto = require('crypto');

// Shared in-memory map: state -> { telegramUserId, chatId, expiresAt }
const oauthStates = new Map();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a random 32-byte hex state token and store it in memory.
 * @param {string} telegramUserId
 * @param {string} chatId
 * @returns {string} state token
 */
function createOAuthState(telegramUserId, chatId) {
    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, {
        telegramUserId: String(telegramUserId),
        chatId: String(chatId),
        expiresAt: Date.now() + STATE_TTL_MS
    });
    return state;
}

/**
 * Validate that a state token exists and has not expired.
 * @param {string} state
 * @returns {Object|null} state entry if valid, null otherwise
 */
function validateOAuthState(state) {
    if (!state || !oauthStates.has(state)) {
        return null;
    }
    const entry = oauthStates.get(state);
    if (Date.now() > entry.expiresAt) {
        oauthStates.delete(state);
        return null;
    }
    return entry;
}

/**
 * Validate and consume (delete) a state token after single use.
 * @param {string} state
 * @returns {Object|null} state entry if valid, null otherwise
 */
function consumeOAuthState(state) {
    const entry = validateOAuthState(state);
    if (state) {
        oauthStates.delete(state);
    }
    return entry;
}

// Periodic cleanup of expired states
setInterval(() => {
    const now = Date.now();
    for (const [state, entry] of oauthStates.entries()) {
        if (now > entry.expiresAt) {
            oauthStates.delete(state);
        }
    }
}, 5 * 60 * 1000).unref();

module.exports = {
    oauthStates,
    createOAuthState,
    validateOAuthState,
    consumeOAuthState
};
