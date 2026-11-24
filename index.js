import http from 'http';
import { randomUUID } from 'crypto';
import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Percorsi (necessari con gli ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Un'unica porta per sito e WebSocket: funziona anche dietro tunnel/HTTPS
const PORT = Number(process.env.PORT) || 3000;
// 30 s: un intervallo corto disconnetteva chi invia/riceve foto su reti lente
const HEARTBEAT_MS = 30000;
const MAX_CONNECTIONS = 200;
const MAX_BUFFERED_BYTES = 16 * 1024 * 1024; // salta i client troppo lenti invece di accumulare memoria

// Limiti di validazione (devono combaciare con quelli in client/app.js)
const MAX_NAME_LENGTH = 20;
const MAX_TEXT_LENGTH = 2000;
const MAX_CAPTION_LENGTH = 500;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB di immagine decodificata
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024; // base64 (+33%) + JSON
const IMAGE_DATA_URL = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

// Anti-flood: massimo N messaggi per finestra temporale per connessione
const RATE_WINDOW_MS = 10000;
const RATE_MAX_MESSAGES = 30;
const RATE_MAX_BYTES = 20 * 1024 * 1024;
// Caratteri invisibili / di controllo usati per falsificare i nomi (es. "Alice\u200B")
const INVISIBLE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const INVISIBLE_CHARS_KEEP_NEWLINES = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

// --- 1. SERVER WEB (HOSTING) ---
const app = express();
app.disable('x-powered-by');
// Solo i file dell'app: il resto della cartella client (sorgenti, config, node_modules) non è pubblico
const CLIENT_DIR = path.join(__dirname, 'client');
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));
['app.js', 'storage.js', 'styles.css'].forEach((file) => {
    app.get(`/${file}`, (req, res) => res.sendFile(path.join(CLIENT_DIR, file)));
});
app.use('/favicon_io', express.static(path.join(CLIENT_DIR, 'favicon_io')));

const server = http.createServer(app);

server.on('error', (err) => {
    console.error(`Impossibile avviare il server sulla porta ${PORT}:`, err.message);
    process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`SITO WEB DISPONIBILE!`);
    console.log(`Link locale: http://localhost:${PORT}`);
    console.log(`=========================================\n`);
});

// --- 2. SERVER WEBSOCKET (LOGICA CHAT) ---
const wss = new WebSocketServer({ server, maxPayload: MAX_PAYLOAD_BYTES, verifyClient: isAllowedConnection });

// Blocca le connessioni da altri siti (il browser invia sempre l'header Origin)
// e limita il numero totale di connessioni.
function isAllowedConnection({ origin, req }) {
    if (wss.clients.size >= MAX_CONNECTIONS) return false;
    if (!origin) return true; // client non-browser (es. test)
    try {
        return new URL(origin).host === req.headers.host;
    } catch {
        return false;
    }
}

function heartbeat() {
    this.isAlive = true;
}

// Ogni 3 secondi: chiude le connessioni che non hanno risposto al ping.
// La chiusura fa scattare l'evento 'close', che avvisa gli altri utenti.
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            console.log(`${ws.name || 'Sconosciuto'} non risponde: disconnesso.`);
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    });
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws) => {
    ws.isAlive = true;
    // L'ID è assegnato dal server: un client non può spacciarsi per un altro
    ws.clientId = randomUUID();
    ws.name = null;
    ws.rate = { windowStart: Date.now(), count: 0, bytes: 0 };
    ws.on('error', (err) => console.error('Errore WebSocket:', err.message));
    ws.on('pong', heartbeat);

    // Invia al nuovo arrivato la lista degli utenti già connessi
    sendRegisteredClients(ws);

    ws.on('message', (raw) => handleIncoming(ws, raw));

    ws.on('close', () => {
        console.log(`${ws.name || 'Un utente'} ha chiuso la pagina.`);
        if (ws.name) {
            broadcast({ type: 'deregistration', clientId: ws.clientId }, ws);
        }
    });
});

// --- GESTIONE MESSAGGI ---

function handleIncoming(ws, raw) {
    if (isRateLimited(ws, raw.length)) {
        sendError(ws, 'Stai inviando troppi messaggi. Attendi qualche secondo.');
        return;
    }

    let data;
    try {
        data = JSON.parse(raw.toString());
    } catch {
        console.warn('Pacchetto non JSON ignorato.');
        return;
    }
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
        case 'registration':
            return handleRegistration(ws, data);
        case 'message':
            return handleTextMessage(ws, data);
        case 'image':
            return handleImageMessage(ws, data);
        default:
            console.warn(`Tipo di messaggio sconosciuto ignorato: ${String(data.type).slice(0, 30)}`);
    }
}

function handleRegistration(ws, data) {
    const name = cleanString(data.name, MAX_NAME_LENGTH, INVISIBLE_CHARS);
    if (!name) {
        sendError(ws, 'Nome non valido: usa da 1 a 20 caratteri visibili.');
        return;
    }
    // Una nuova registrazione sulla stessa connessione aggiorna solo il nome (stesso ID: niente utenti fantasma)
    ws.name = name;
    console.log(`Utente registrato: ${name}`);
    broadcast({ type: 'registration', name, clientId: ws.clientId }, ws);
}

function handleTextMessage(ws, data) {
    if (!ws.name) return sendError(ws, 'Devi prima entrare nella chat.');
    const text = cleanString(data.text, MAX_TEXT_LENGTH, INVISIBLE_CHARS_KEEP_NEWLINES);
    if (!text) return;
    broadcast({ type: 'message', name: ws.name, clientId: ws.clientId, text }, ws);
}

function handleImageMessage(ws, data) {
    if (!ws.name) return sendError(ws, 'Devi prima entrare nella chat.');

    const match = typeof data.dataUrl === 'string' ? IMAGE_DATA_URL.exec(data.dataUrl) : null;
    if (!match) {
        return sendError(ws, 'Formato immagine non supportato (usa JPG, PNG, GIF o WEBP).');
    }
    const base64 = match[2];
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const decodedBytes = (base64.length * 3) / 4 - padding;
    if (decodedBytes > MAX_IMAGE_BYTES) {
        return sendError(ws, 'Immagine troppo grande (massimo 5 MB).');
    }

    const caption = cleanString(data.caption, MAX_CAPTION_LENGTH, INVISIBLE_CHARS_KEEP_NEWLINES) || '';
    broadcast({
        type: 'image',
        name: ws.name,
        clientId: ws.clientId,
        dataUrl: data.dataUrl,
        caption
    }, ws);
}

// --- FUNZIONI DI SUPPORTO ---

function cleanString(value, maxLength, stripPattern) {
    if (typeof value !== 'string') return null;
    const trimmed = value.replace(stripPattern, '').trim();
    if (!trimmed || trimmed.length > maxLength) return null;
    return trimmed;
}

// Limita sia il numero di messaggi sia i byte inviati per finestra di 10 s
function isRateLimited(ws, byteLength) {
    const now = Date.now();
    const current = now - ws.rate.windowStart > RATE_WINDOW_MS
        ? { windowStart: now, count: 0, bytes: 0 }
        : ws.rate;
    ws.rate = { ...current, count: current.count + 1, bytes: current.bytes + byteLength };
    return ws.rate.count > RATE_MAX_MESSAGES || ws.rate.bytes > RATE_MAX_BYTES;
}

function sendError(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message }));
    }
}

function broadcast(payload, except) {
    const serialized = JSON.stringify(payload);
    wss.clients.forEach((client) => {
        // Solo agli utenti registrati: una connessione anonima non può "ascoltare" la chat
        if (client === except || !client.name || client.readyState !== WebSocket.OPEN) return;
        if (client.bufferedAmount > MAX_BUFFERED_BYTES) {
            console.warn(`${client.name} è troppo lento: messaggio saltato.`);
            return;
        }
        client.send(serialized);
    });
}

function sendRegisteredClients(ws) {
    wss.clients.forEach((client) => {
        if (client === ws || client.readyState !== WebSocket.OPEN || !client.name) return;
        ws.send(JSON.stringify({ type: 'registration', name: client.name, clientId: client.clientId }));
    });
}
