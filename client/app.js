(function () {
    'use strict';

    // --- Configuration (limits must match index.js on the server) ---
    const CONFIG = {
        maxNameLength: 20,
        maxTextLength: 2000,
        maxCaptionLength: 500,
        maxImageBytes: 5 * 1024 * 1024, // size actually sent (after compression)
        maxOriginalBytes: 20 * 1024 * 1024, // phone photos are often >5 MB: they get compressed first
        maxImageSide: 1600,
        jpegQuality: 0.85,
        maxMessagesInDom: 200,
        allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        reconnectDelayMs: 3000,
        nearBottomPx: 120,
        saveDelayMs: 300,
        emojis: ['😀', '😂', '😊', '😍', '😎', '🤔', '😢', '😡',
            '👍', '👎', '👏', '🙏', '💪', '🎉', '❤️', '🔥',
            '✅', '❌', '⭐', '☕', '🍕', '⚽', '🚀', '👋']
    };
    const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
    const CHECK_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-neon-cyan" aria-hidden="true"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>';

    // Fallback so the chat keeps working even if storage.js failed to load
    const storage = window.ChatStorage || {
        isAvailable: false,
        load: () => ({ messages: [], recovered: false }),
        save: (messages) => ({ ok: false, messages }),
        clear: () => {},
        onClearedElsewhere: () => {}
    };

    // --- State (replaced, never mutated in place) ---
    let state = {
        currentUser: null,
        onlineUsers: [],
        userFilter: '',
        isConnected: false,
        isSidebarOpen: false,
        pendingPhoto: null, // { dataUrl, name, size }
        lastSenderKey: null,
        messageCount: 0,
        history: [] // messages saved to localStorage
    };
    let ws = null;
    let reconnectTimer = null;
    let saveTimer = null;
    let photoReadToken = 0; // ignores stale reads when the user picks/removes another photo

    function setState(patch) {
        state = Object.assign({}, state, patch);
    }

    // --- DOM Elements ---
    const byId = (id) => document.getElementById(id);
    const els = {
        loginModal: byId('login-modal'),
        chatInterface: byId('chat-interface'),
        loginForm: byId('login-form'),
        usernameInput: byId('username-input'),
        joinBtn: byId('join-btn'),
        currentUserAvatar: byId('current-user-avatar'),
        currentUserName: byId('current-user-name'),
        currentUserStatus: byId('current-user-status'),
        currentUserStatusDot: byId('current-user-status-dot'),
        currentUserStatusText: byId('current-user-status-text'),
        onlineCount: byId('online-count'),
        userSearch: byId('user-search'),
        usersList: byId('users-list'),
        connectionFooter: byId('connection-footer'),
        historyStatus: byId('history-status'),
        offlineBadge: byId('offline-badge'),
        clearChatBtn: byId('clear-chat-btn'),
        clearDialog: byId('clear-dialog'),
        clearCancelBtn: byId('clear-cancel-btn'),
        clearConfirmBtn: byId('clear-confirm-btn'),
        messagesContainer: byId('messages-container'),
        messagesList: byId('messages-list'),
        emptyState: byId('empty-state'),
        messageInput: byId('message-input'),
        sendBtn: byId('send-btn'),
        attachBtn: byId('attach-btn'),
        photoInput: byId('photo-input'),
        photoPreview: byId('photo-preview'),
        photoPreviewImg: byId('photo-preview-img'),
        photoPreviewName: byId('photo-preview-name'),
        photoPreviewSize: byId('photo-preview-size'),
        photoRemoveBtn: byId('photo-remove-btn'),
        composerError: byId('composer-error'),
        emojiBtn: byId('emoji-btn'),
        emojiPicker: byId('emoji-picker'),
        chatWindow: byId('chat-window'),
        dropOverlay: byId('drop-overlay'),
        lightbox: byId('lightbox'),
        lightboxImg: byId('lightbox-img'),
        lightboxClose: byId('lightbox-close'),
        mobileMenuBtn: byId('mobile-menu-btn'),
        closeSidebarBtn: byId('close-sidebar-btn'),
        sidebar: byId('sidebar'),
        sidebarOverlay: byId('sidebar-overlay')
    };

    function refreshIcons() {
        if (window.lucide) window.lucide.createIcons();
    }

    // --- Helpers ---
    function getCurrentTime() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function initialOf(name) {
        // Array.from keeps emoji intact (charAt would split them in half)
        return (Array.from(name || '?')[0] || '?').toUpperCase();
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function setVisible(node, visible, displayClass) {
        node.classList.toggle('hidden', !visible);
        if (displayClass) node.classList.toggle(displayClass, visible);
    }

    // --- Rendering: layout & connection ---
    function renderUI() {
        const loggedIn = Boolean(state.currentUser);
        setVisible(els.loginModal, !loggedIn);
        setVisible(els.chatInterface, loggedIn);
        if (loggedIn) {
            els.currentUserName.textContent = state.currentUser.name;
            els.currentUserAvatar.textContent = initialOf(state.currentUser.name);
        }
        renderConnection();
        renderSidebar();
        updateSendButton();
    }

    function renderConnection() {
        const online = state.isConnected;
        setVisible(els.offlineBadge, !online, 'flex');

        els.currentUserStatus.classList.toggle('text-neon-green', online);
        els.currentUserStatus.classList.toggle('text-neon-red', !online);
        els.currentUserStatusDot.classList.toggle('bg-neon-green', online);
        els.currentUserStatusDot.classList.toggle('bg-neon-red', !online);
        els.currentUserStatusText.textContent = online ? 'Online' : 'Offline';
        els.connectionFooter.textContent = online
            ? 'Connected to the server'
            : 'Not connected – trying again every few seconds…';

        els.messageInput.placeholder = online ? 'Type a message…' : 'Offline – waiting for the connection…';
    }

    function renderSidebar() {
        const open = state.isSidebarOpen;
        els.sidebar.classList.toggle('-translate-x-full', !open);
        setVisible(els.sidebarOverlay, open);
        els.mobileMenuBtn.setAttribute('aria-expanded', String(open));
    }

    function setHistoryStatus(text) {
        els.historyStatus.textContent = text;
    }

    // --- Rendering: users ---
    function renderUsers() {
        els.onlineCount.textContent = String(state.onlineUsers.length);
        els.usersList.replaceChildren();

        if (state.onlineUsers.length === 0) {
            els.usersList.appendChild(el('div', 'py-8 text-center text-sm text-slate-400', 'No other users online.'));
            return;
        }

        const filter = state.userFilter.toLowerCase();
        const visible = state.onlineUsers.filter((u) => u.name.toLowerCase().includes(filter));
        if (visible.length === 0) {
            els.usersList.appendChild(el('div', 'py-8 text-center text-sm text-slate-400', 'No users match your search.'));
            return;
        }
        const fragment = document.createDocumentFragment();
        visible.forEach((user) => fragment.appendChild(buildUserRow(user)));
        els.usersList.appendChild(fragment);
    }

    function buildUserRow(user) {
        const row = el('div', 'flex min-h-[56px] items-center gap-3 rounded-lg px-3 py-2 hover:bg-ink-800');
        const avatarWrap = el('div', 'relative shrink-0');
        avatarWrap.appendChild(el('div',
            'flex h-10 w-10 items-center justify-center rounded-full border border-fuchsia-400/40 bg-ink-800 font-semibold text-fuchsia-200',
            initialOf(user.name)));
        avatarWrap.appendChild(el('span', 'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-ink-900 bg-neon-green'));

        const info = el('div', 'min-w-0 flex-1');
        info.appendChild(el('h4', 'truncate font-medium text-slate-100', user.name));
        info.appendChild(el('p', 'truncate text-xs text-neon-green', 'Online'));

        row.append(avatarWrap, info);
        return row;
    }

    // --- Rendering: messages (appended one by one, no full re-render) ---
    function isNearBottom() {
        const c = els.messagesContainer;
        return c.scrollHeight - c.scrollTop - c.clientHeight < CONFIG.nearBottomPx;
    }

    function scrollToBottom() {
        els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
    }

    function senderKeyOf(msg) {
        return msg.isSelf ? 'self' : (msg.clientId || msg.name);
    }

    function buildMessageRow(msg, isRepeatedSender, options) {
        const align = msg.isSelf ? 'items-end' : 'items-start';
        const spacing = isRepeatedSender ? 'mt-1' : 'mt-4';
        const row = el('div', `flex w-full min-w-0 flex-col ${align} ${spacing}${options.animate ? ' msg-enter' : ''}`);
        if (!msg.isSelf && !isRepeatedSender) {
            row.appendChild(el('span', 'mb-1 ml-1 max-w-full truncate text-xs font-semibold text-fuchsia-200', msg.name));
        }
        row.appendChild(buildBubble(msg, options.scrollOnImageLoad));
        return row;
    }

    // options: { animate, persist }
    function appendMessage(msg, options) {
        const opts = Object.assign({ animate: true, persist: true }, options);
        const shouldScroll = msg.isSelf || isNearBottom();
        const senderKey = senderKeyOf(msg);
        const isRepeatedSender = state.lastSenderKey === senderKey;

        if (state.messageCount === 0) els.emptyState.classList.add('hidden');
        els.messagesList.appendChild(buildMessageRow(msg, isRepeatedSender, { animate: opts.animate, scrollOnImageLoad: shouldScroll }));

        setState({ lastSenderKey: senderKey, messageCount: state.messageCount + 1 });
        trimOldMessages();
        if (shouldScroll) scrollToBottom();
        if (opts.persist) rememberMessage(msg);
    }

    // Keeps memory bounded: very long chats (especially with photos) would otherwise crash mobile tabs
    function trimOldMessages() {
        const rows = els.messagesList.querySelectorAll(':scope > div:not(#empty-state)');
        const excess = rows.length - CONFIG.maxMessagesInDom;
        for (let i = 0; i < excess; i += 1) rows[i].remove();
    }

    function buildBubble(msg, scrollOnImageLoad) {
        const variant = msg.isSelf ? 'bubble-self' : 'bubble-other';
        const bubble = el('div', `relative min-w-[84px] max-w-[85%] rounded-xl px-3 py-2 pb-6 sm:max-w-[75%] lg:max-w-[65%] ${variant}`);

        if (msg.imageUrl) bubble.appendChild(buildImage(msg, scrollOnImageLoad));
        if (msg.imageRemoved) {
            bubble.appendChild(el('p', 'text-xs italic text-slate-400', 'Photo not kept in history (browser storage was full).'));
        }
        if (msg.text) {
            const spacing = msg.imageUrl || msg.imageRemoved ? 'mt-1 ' : '';
            bubble.appendChild(el('p', `${spacing}wrap-anywhere whitespace-pre-wrap text-[15px] leading-relaxed`, msg.text));
        }

        const meta = el('div', 'absolute bottom-1 right-2 flex items-center space-x-1');
        meta.appendChild(el('span', `text-[11px] ${msg.isSelf ? 'text-cyan-200/80' : 'text-slate-400'}`, msg.timestamp));
        if (msg.isSelf) meta.insertAdjacentHTML('beforeend', CHECK_ICON);
        bubble.appendChild(meta);
        return bubble;
    }

    function buildImage(msg, scrollOnImageLoad) {
        const button = el('button', 'block max-w-full overflow-hidden rounded-lg');
        button.type = 'button';
        button.setAttribute('aria-label', `Open photo from ${msg.isSelf ? 'you' : msg.name}`);
        const img = el('img', 'max-h-72 w-auto max-w-full bg-ink-700 object-contain');
        img.alt = msg.text ? `Photo: ${msg.text}` : `Photo from ${msg.isSelf ? 'you' : msg.name}`;
        img.loading = 'lazy';
        img.decoding = 'async';
        if (scrollOnImageLoad) img.addEventListener('load', scrollToBottom, { once: true });
        img.src = msg.imageUrl;
        button.appendChild(img);
        button.addEventListener('click', () => openLightbox(msg.imageUrl, img.alt));
        return button;
    }

    // --- Chat history (localStorage) ---
    function toStoredMessage(msg) {
        return {
            name: msg.name,
            clientId: msg.clientId || null,
            text: msg.text || '',
            imageUrl: msg.imageUrl || null,
            imageRemoved: Boolean(msg.imageRemoved),
            timestamp: msg.timestamp,
            isSelf: Boolean(msg.isSelf)
        };
    }

    function rememberMessage(msg) {
        const history = state.history.concat([toStoredMessage(msg)]).slice(-CONFIG.maxMessagesInDom);
        setState({ history });
        scheduleSave();
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, CONFIG.saveDelayMs);
    }

    function flushSave() {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (!storage.isAvailable) return;
        const result = storage.save(state.history);
        if (!result.ok) {
            setHistoryStatus('History could not be saved in this browser');
            return;
        }
        const photosDropped = result.messages.some((m) => m.imageRemoved);
        setState({ history: result.messages });
        setHistoryStatus(photosDropped
            ? 'History saved – some older photos were too big to keep'
            : 'History saved in this browser');
    }

    function restoreHistory() {
        if (!storage.isAvailable) {
            setHistoryStatus('History is not saved: browser storage is blocked');
            return;
        }
        const { messages, recovered } = storage.load();
        if (recovered) setHistoryStatus('Some saved messages were damaged and were skipped');
        if (messages.length === 0) return;

        const fragment = document.createDocumentFragment();
        let lastKey = null;
        messages.forEach((msg) => {
            const key = senderKeyOf(msg);
            fragment.appendChild(buildMessageRow(msg, key === lastKey, { animate: false, scrollOnImageLoad: false }));
            lastKey = key;
        });
        els.emptyState.classList.add('hidden');
        els.messagesList.appendChild(fragment);
        setState({ history: messages, lastSenderKey: lastKey, messageCount: messages.length });
    }

    function clearChat() {
        clearTimeout(saveTimer);
        storage.clear();
        clearChatView();
        setHistoryStatus(storage.isAvailable ? 'Chat cleared' : 'History is not saved: browser storage is blocked');
    }

    function clearChatView() {
        els.messagesList.querySelectorAll(':scope > div:not(#empty-state)').forEach((row) => row.remove());
        els.emptyState.classList.remove('hidden');
        setState({ history: [], lastSenderKey: null, messageCount: 0 });
    }

    function openClearDialog() {
        setVisible(els.clearDialog, true, 'flex');
        els.clearCancelBtn.focus();
    }

    function closeClearDialog() {
        setVisible(els.clearDialog, false, 'flex');
        els.clearChatBtn.focus();
    }

    // --- Composer ---
    function hasContent() {
        return Boolean(els.messageInput.value.trim() || state.pendingPhoto);
    }

    function updateSendButton() {
        const enabled = hasContent() && state.isConnected;
        els.sendBtn.disabled = !enabled;
        ['bg-neon-cyan', 'text-ink-950', 'hover:bg-cyan-300', 'hover:text-ink-950'].forEach((c) => els.sendBtn.classList.toggle(c, enabled));
    }

    function autoResizeInput() {
        els.messageInput.style.height = 'auto';
        els.messageInput.style.height = `${els.messageInput.scrollHeight}px`;
    }

    function showError(message) {
        els.composerError.textContent = message;
        els.composerError.classList.remove('hidden');
    }

    function clearError() {
        els.composerError.textContent = '';
        els.composerError.classList.add('hidden');
    }

    function resetComposer() {
        els.messageInput.value = '';
        autoResizeInput();
        clearPhoto();
        clearError();
        updateSendButton();
    }

    // --- Photo upload ---
    function validatePhoto(file) {
        if (!file) return 'No file selected.';
        if (!CONFIG.allowedImageTypes.includes(file.type)) {
            return 'Unsupported format. Please choose a JPG, PNG, GIF or WEBP image.';
        }
        const limit = file.type === 'image/gif' ? CONFIG.maxImageBytes : CONFIG.maxOriginalBytes;
        if (file.size > limit) {
            return `This photo is ${formatBytes(file.size)}. The maximum size is ${formatBytes(limit)}.`;
        }
        return null;
    }

    function readAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Image could not be decoded'));
            img.src = src;
        });
    }

    // Resizes large photos (max 1600px, JPEG) so they upload fast even on mobile.
    // GIFs are left untouched to keep the animation.
    async function preparePhoto(file) {
        const original = await readAsDataUrl(file);
        if (file.type === 'image/gif') return original;
        const img = await loadImage(original);
        const scale = Math.min(1, CONFIG.maxImageSide / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale === 1 && file.size <= 1024 * 1024) return original;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; // transparent PNG areas become white instead of black
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', CONFIG.jpegQuality);
    }

    function dataUrlBytes(dataUrl) {
        const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
        const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
        return (base64.length * 3) / 4 - padding;
    }

    function handlePhotoFile(file) {
        clearError();
        const error = validatePhoto(file);
        if (error) {
            showError(error);
            return;
        }
        photoReadToken += 1;
        const token = photoReadToken;
        preparePhoto(file).then((dataUrl) => {
            if (token !== photoReadToken) return; // another photo was picked or this one removed
            if (!SAFE_IMAGE_DATA_URL.test(dataUrl)) {
                showError('This file could not be read as an image.');
                return;
            }
            const size = dataUrlBytes(dataUrl);
            if (size > CONFIG.maxImageBytes) {
                showError(`This photo is still ${formatBytes(size)} after compression. The maximum is ${formatBytes(CONFIG.maxImageBytes)}.`);
                return;
            }
            setState({ pendingPhoto: { dataUrl, name: file.name, size } });
            renderPhotoPreview();
            els.messageInput.focus();
        }).catch((e) => {
            if (token !== photoReadToken) return;
            console.warn('Photo could not be prepared.', e);
            showError('Could not read this image. Please try another file.');
        });
    }

    function renderPhotoPreview() {
        const photo = state.pendingPhoto;
        setVisible(els.photoPreview, Boolean(photo), 'flex');
        if (photo) {
            els.photoPreviewImg.src = photo.dataUrl;
            els.photoPreviewName.textContent = photo.name;
            els.photoPreviewSize.textContent = formatBytes(photo.size);
        } else {
            els.photoPreviewImg.removeAttribute('src');
        }
        els.messageInput.maxLength = photo ? CONFIG.maxCaptionLength : CONFIG.maxTextLength;
        updateSendButton();
    }

    function clearPhoto() {
        photoReadToken += 1;
        setState({ pendingPhoto: null });
        els.photoInput.value = '';
        renderPhotoPreview();
    }

    // --- Lightbox ---
    function openLightbox(src, alt) {
        els.lightboxImg.src = src;
        els.lightboxImg.alt = alt || '';
        setVisible(els.lightbox, true, 'flex');
        els.lightboxClose.focus();
    }

    function closeLightbox() {
        setVisible(els.lightbox, false, 'flex');
        els.lightboxImg.removeAttribute('src');
    }

    // --- Emoji picker ---
    function buildEmojiPicker() {
        const fragment = document.createDocumentFragment();
        CONFIG.emojis.forEach((emoji) => {
            const btn = el('button', 'h-11 rounded-lg text-xl leading-none hover:bg-ink-700', emoji);
            btn.type = 'button';
            btn.setAttribute('role', 'option');
            btn.setAttribute('aria-label', `Insert ${emoji}`);
            btn.addEventListener('click', () => insertAtCursor(emoji));
            fragment.appendChild(btn);
        });
        els.emojiPicker.appendChild(fragment);
    }

    function toggleEmojiPicker(forceOpen) {
        const open = typeof forceOpen === 'boolean' ? forceOpen : els.emojiPicker.classList.contains('hidden');
        setVisible(els.emojiPicker, open, 'grid');
        els.emojiBtn.setAttribute('aria-expanded', String(open));
    }

    function insertAtCursor(text) {
        const input = els.messageInput;
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const next = input.value.slice(0, start) + text + input.value.slice(end);
        if (next.length > input.maxLength) return;
        input.value = next;
        input.focus();
        input.setSelectionRange(start + text.length, start + text.length);
        autoResizeInput();
        updateSendButton();
    }

    // --- WebSocket ---
    function getWsUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Same host and port as the page (the server shares one port for HTTP and WebSocket)
        const host = window.location.host || 'localhost:3000';
        return `${protocol}//${host}`;
    }

    function sendJson(payload) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify(payload));
        return true;
    }

    function connect() {
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
        clearTimeout(reconnectTimer);

        let socket;
        try {
            socket = new WebSocket(getWsUrl());
            ws = socket;
        } catch (e) {
            console.error('Could not open the WebSocket connection.', e);
            scheduleReconnect();
            return;
        }

        socket.onopen = () => {
            if (socket !== ws) return;
            // Fresh list after (re)connecting: the server re-sends who is online
            setState({ isConnected: true, onlineUsers: [] });
            renderUsers();
            renderUI();
            sendJson({ type: 'registration', name: state.currentUser.name });
        };
        socket.onmessage = (event) => {
            if (socket === ws) handleServerMessage(event.data);
        };
        socket.onclose = () => {
            if (socket !== ws) return; // late close of an old, replaced socket
            setState({ isConnected: false });
            renderUI();
            scheduleReconnect();
        };
        socket.onerror = (e) => console.warn('WebSocket error', e);
    }

    function scheduleReconnect() {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, CONFIG.reconnectDelayMs);
    }

    function handleServerMessage(raw) {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            console.warn('Ignored a non-JSON message from the server.', e);
            return;
        }
        switch (data.type) {
            case 'message': return onTextMessage(data);
            case 'image': return onImageMessage(data);
            case 'registration': return onUserJoined(data);
            case 'deregistration': return onUserLeft(data);
            case 'error': return showError(String(data.message || 'The server rejected the message.'));
            default: console.warn('Unknown message type', data.type);
        }
    }

    function onTextMessage(data) {
        if (typeof data.text !== 'string' || !data.text) return;
        appendMessage({ name: String(data.name || 'Unknown'), clientId: data.clientId, text: data.text, timestamp: getCurrentTime(), isSelf: false });
    }

    function onImageMessage(data) {
        if (typeof data.dataUrl !== 'string' || !SAFE_IMAGE_DATA_URL.test(data.dataUrl)) return;
        appendMessage({
            name: String(data.name || 'Unknown'),
            clientId: data.clientId,
            imageUrl: data.dataUrl,
            text: typeof data.caption === 'string' ? data.caption : '',
            timestamp: getCurrentTime(),
            isSelf: false
        });
    }

    function onUserJoined(data) {
        if (!data.clientId) return;
        const others = state.onlineUsers.filter((u) => u.clientId !== data.clientId);
        setState({ onlineUsers: others.concat([{ name: String(data.name || 'Unknown'), clientId: data.clientId }]) });
        renderUsers();
    }

    function onUserLeft(data) {
        setState({ onlineUsers: state.onlineUsers.filter((u) => u.clientId !== data.clientId) });
        renderUsers();
    }

    // --- Actions ---
    function login(name) {
        setState({ currentUser: { name } });
        renderUI();
        renderUsers();
        connect();
        scrollToBottom(); // restored history becomes visible only now
        els.messageInput.focus();
    }

    function sendCurrent() {
        if (!hasContent()) return;
        if (!state.isConnected) {
            showError('You are offline. Your message will be ready to send once the connection is back.');
            return;
        }
        const text = els.messageInput.value.trim();
        const photo = state.pendingPhoto;

        if (photo && text.length > CONFIG.maxCaptionLength) {
            showError(`Captions can be up to ${CONFIG.maxCaptionLength} characters.`);
            return;
        }
        const sent = photo
            ? sendJson({ type: 'image', dataUrl: photo.dataUrl, caption: text })
            : sendJson({ type: 'message', text });
        if (!sent) {
            showError('Message not sent: connection lost. Please try again.');
            return;
        }

        appendMessage({
            name: state.currentUser.name,
            imageUrl: photo ? photo.dataUrl : null,
            text,
            timestamp: getCurrentTime(),
            isSelf: true
        });
        resetComposer();
        toggleEmojiPicker(false);
    }

    function setSidebarOpen(open) {
        setState({ isSidebarOpen: open });
        renderSidebar();
    }

    // --- Virtual keyboard / viewport ---
    // iOS Safari doesn't resize the layout when the keyboard opens: follow the visual viewport instead.
    function bindViewport() {
        const vv = window.visualViewport;
        if (!vv) return;
        let frame = 0;
        const update = () => {
            frame = 0;
            const wasNearBottom = isNearBottom();
            document.documentElement.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
            if (window.scrollY !== 0) window.scrollTo(0, 0);
            if (wasNearBottom) scrollToBottom();
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };
        vv.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', schedule);
    }

    // --- Event Listeners ---
    function bindLoginEvents() {
        els.usernameInput.addEventListener('input', () => {
            els.joinBtn.disabled = !els.usernameInput.value.trim();
        });
        els.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = Array.from(els.usernameInput.value.trim()).slice(0, CONFIG.maxNameLength).join('').trim();
            if (name) login(name);
        });
    }

    function bindComposerEvents() {
        els.messageInput.addEventListener('input', () => {
            autoResizeInput();
            updateSendButton();
        });
        els.messageInput.addEventListener('keydown', (e) => {
            // isComposing: don't send while an IME (e.g. Japanese/Chinese keyboard) is composing
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                sendCurrent();
            }
        });
        els.messageInput.addEventListener('paste', (e) => {
            const clipboard = e.clipboardData;
            if (!clipboard || clipboard.getData('text/plain')) return; // text wins: never drop pasted text
            const file = Array.from(clipboard.files || []).find((f) => f.type.startsWith('image/'));
            if (file) {
                e.preventDefault();
                handlePhotoFile(file);
            }
        });
        els.sendBtn.addEventListener('click', sendCurrent);
        els.attachBtn.addEventListener('click', () => els.photoInput.click());
        els.photoInput.addEventListener('change', () => handlePhotoFile(els.photoInput.files[0]));
        els.photoRemoveBtn.addEventListener('click', () => {
            clearPhoto();
            els.messageInput.focus();
        });
        els.emojiBtn.addEventListener('click', () => toggleEmojiPicker());
    }

    function bindHistoryEvents() {
        els.clearChatBtn.addEventListener('click', openClearDialog);
        els.clearCancelBtn.addEventListener('click', closeClearDialog);
        els.clearConfirmBtn.addEventListener('click', () => {
            clearChat();
            closeClearDialog();
        });
        els.clearDialog.addEventListener('click', (e) => {
            if (e.target === els.clearDialog) closeClearDialog();
        });
        // Save immediately when the tab is hidden or closed (the debounce might not run otherwise)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && saveTimer) flushSave();
        });
        window.addEventListener('pagehide', () => {
            if (saveTimer) flushSave();
        });
        // Another tab cleared the chat: mirror it here
        storage.onClearedElsewhere(() => {
            clearTimeout(saveTimer);
            saveTimer = null;
            clearChatView();
            setHistoryStatus('Chat cleared in another tab');
        });
    }

    function bindDragAndDrop() {
        let dragDepth = 0;
        const showOverlay = (visible) => setVisible(els.dropOverlay, visible, 'flex');
        const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

        els.chatWindow.addEventListener('dragenter', (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth += 1;
            showOverlay(true);
        });
        els.chatWindow.addEventListener('dragover', (e) => {
            if (hasFiles(e)) e.preventDefault();
        });
        els.chatWindow.addEventListener('dragleave', () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) showOverlay(false);
        });
        els.chatWindow.addEventListener('drop', (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth = 0;
            showOverlay(false);
            handlePhotoFile(e.dataTransfer.files[0]);
        });
    }

    function handleEscape() {
        if (!els.clearDialog.classList.contains('hidden')) return closeClearDialog();
        if (!els.lightbox.classList.contains('hidden')) return closeLightbox();
        if (!els.emojiPicker.classList.contains('hidden')) return toggleEmojiPicker(false);
        if (state.isSidebarOpen) setSidebarOpen(false);
    }

    function bindLayoutEvents() {
        els.mobileMenuBtn.addEventListener('click', () => setSidebarOpen(true));
        els.closeSidebarBtn.addEventListener('click', () => setSidebarOpen(false));
        els.sidebarOverlay.addEventListener('click', () => setSidebarOpen(false));
        els.userSearch.addEventListener('input', () => {
            setState({ userFilter: els.userSearch.value.trim() });
            renderUsers();
        });
        els.lightbox.addEventListener('click', (e) => {
            if (e.target !== els.lightboxImg) closeLightbox();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') handleEscape();
        });
        // After a network switch the old socket can look "open" but be dead: replace it
        window.addEventListener('online', () => {
            if (!state.currentUser) return;
            const old = ws;
            ws = null;
            if (old) old.close();
            setState({ isConnected: false });
            renderUI();
            connect();
        });
    }

    // --- Init ---
    buildEmojiPicker();
    bindLoginEvents();
    bindComposerEvents();
    bindHistoryEvents();
    bindDragAndDrop();
    bindLayoutEvents();
    bindViewport();
    restoreHistory();
    refreshIcons();
    renderUI();
})();
