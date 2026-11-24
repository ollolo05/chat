/*
 * Chat history saved in localStorage: it survives page reloads and closing/reopening
 * the browser, until the user clears it with the "Clear chat" button.
 * Exposes window.ChatStorage (used by app.js).
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'neonchat.history.v1';
    const FORMAT_VERSION = 1;
    const MAX_MESSAGES = 200;
    const MAX_NAME_LENGTH = 40;
    const MAX_TEXT_LENGTH = 2000;
    const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
    const TIMESTAMP = /^\d{2}:\d{2}$/;

    function getStore() {
        try {
            const store = window.localStorage;
            const probe = '__neonchat_probe__';
            store.setItem(probe, '1');
            store.removeItem(probe);
            return store;
        } catch (e) {
            console.warn('localStorage is not available: chat history will not be saved.', e);
            return null;
        }
    }

    const store = getStore();

    // Returns a clean copy of a stored message, or null if it is not valid
    function sanitizeMessage(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = typeof raw.name === 'string' ? raw.name.slice(0, MAX_NAME_LENGTH) : '';
        const text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_TEXT_LENGTH) : '';
        const imageUrl = typeof raw.imageUrl === 'string' && SAFE_IMAGE_DATA_URL.test(raw.imageUrl) ? raw.imageUrl : null;
        const imageRemoved = raw.imageRemoved === true && !imageUrl;
        if (!name || (!text && !imageUrl && !imageRemoved)) return null;
        if (typeof raw.timestamp !== 'string' || !TIMESTAMP.test(raw.timestamp)) return null;
        if (typeof raw.isSelf !== 'boolean') return null;
        return {
            name,
            clientId: typeof raw.clientId === 'string' ? raw.clientId.slice(0, 64) : null,
            text,
            imageUrl,
            imageRemoved,
            timestamp: raw.timestamp,
            isSelf: raw.isSelf
        };
    }

    // { messages, recovered } — recovered=true when corrupt data had to be discarded
    function load() {
        if (!store) return { messages: [], recovered: false };
        let raw;
        try {
            raw = store.getItem(STORAGE_KEY);
        } catch (e) {
            console.warn('Could not read chat history.', e);
            return { messages: [], recovered: false };
        }
        if (raw === null) return { messages: [], recovered: false };

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.version !== FORMAT_VERSION || !Array.isArray(parsed.messages)) {
                throw new Error('Unexpected history format');
            }
            const messages = parsed.messages.map(sanitizeMessage).filter(Boolean).slice(-MAX_MESSAGES);
            return { messages, recovered: messages.length !== parsed.messages.length };
        } catch (e) {
            console.warn('Saved chat history was invalid and has been reset.', e);
            safeRemove();
            return { messages: [], recovered: true };
        }
    }

    function isQuotaError(e) {
        return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
    }

    // Frees space: first drops the oldest photo, then the oldest message
    function shrink(messages) {
        const index = messages.findIndex((m) => m.imageUrl);
        if (index !== -1) {
            return messages.map((m, i) => (i === index ? Object.assign({}, m, { imageUrl: null, imageRemoved: true }) : m));
        }
        return messages.slice(1);
    }

    // { ok, messages } — messages is what was actually stored (may have fewer photos if storage was full)
    function save(messages) {
        if (!store) return { ok: false, messages };
        let toStore = messages.slice(-MAX_MESSAGES);
        while (true) {
            try {
                store.setItem(STORAGE_KEY, JSON.stringify({ version: FORMAT_VERSION, messages: toStore }));
                return { ok: true, messages: toStore };
            } catch (e) {
                if (!isQuotaError(e) || toStore.length === 0) {
                    console.warn('Could not save chat history.', e);
                    return { ok: false, messages };
                }
                toStore = shrink(toStore);
            }
        }
    }

    function safeRemove() {
        if (!store) return;
        try {
            store.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('Could not clear chat history.', e);
        }
    }

    // Calls back when another tab of the same browser clears the history
    function onClearedElsewhere(callback) {
        window.addEventListener('storage', (e) => {
            if (e.key === STORAGE_KEY && e.newValue === null) callback();
        });
    }

    window.ChatStorage = Object.freeze({
        isAvailable: Boolean(store),
        maxMessages: MAX_MESSAGES,
        load,
        save,
        clear: safeRemove,
        sanitizeMessage,
        onClearedElsewhere
    });
})();
