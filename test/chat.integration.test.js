// Integration test: starts the real server and talks to it over real WebSockets.
// Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = Number(process.env.TEST_PORT) || 3999;
const URL = `ws://localhost:${PORT}`;
let server;

before(async () => {
    server = spawn(process.execPath, ['index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
    await new Promise((resolve, reject) => {
        server.stdout.on('data', (d) => d.toString().includes('SITO WEB DISPONIBILE') && resolve());
        server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
    });
});
after(() => server.kill());

function open(headers = {}) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(URL, { headers });
        const inbox = [];
        ws.on('message', (d) => inbox.push(JSON.parse(d.toString())));
        ws.on('open', () => resolve({ ws, inbox }));
        ws.on('error', reject);
    });
}
const send = (c, p) => c.ws.send(JSON.stringify(p));

// Waits until a message matching the predicate arrives (no fixed sleeps)
function waitFor(client, predicate, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const tick = () => {
            const found = client.inbox.find(predicate);
            if (found) return resolve(found);
            if (Date.now() - started > timeoutMs) return reject(new Error('timeout waiting for message'));
            setTimeout(tick, 20);
        };
        tick();
    });
}
// Proves something did NOT arrive: sends a marker afterwards and checks ordering
async function settle(sender, receiver) {
    const marker = `marker-${Math.random()}`;
    send(sender, { type: 'message', text: marker });
    await waitFor(receiver, (m) => m.text === marker);
}
async function registered(name) {
    const c = await open();
    send(c, { type: 'registration', name });
    return c;
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const base64OfBytes = (n) => Buffer.alloc(n, 1).toString('base64');

test('serves only the app files', async () => {
    const page = await fetch(`http://localhost:${PORT}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<script defer src="app.js"><\/script>/);
    for (const file of ['app.js', 'storage.js', 'styles.css']) {
        assert.equal((await fetch(`http://localhost:${PORT}/${file}`)).status, 200, file);
    }
    assert.equal((await fetch(`http://localhost:${PORT}/styles.src.css`)).status, 404);
    assert.equal((await fetch(`http://localhost:${PORT}/favicon_io/site.webmanifest`)).status, 200);
    assert.equal((await fetch(`http://localhost:${PORT}/package.json`)).status, 404);
    assert.equal((await fetch(`http://localhost:${PORT}/vite.config.ts`)).status, 404);
});

test('text and image messages use the server-side identity', async () => {
    const a = await registered('Alice');
    const b = await registered('Bob');
    const aliceJoin = await waitFor(b, (m) => m.type === 'registration' && m.name === 'Alice');

    send(a, { type: 'message', name: 'Mallory', clientId: 'spoof', text: '  <b>hi</b>  ' });
    const text = await waitFor(b, (m) => m.type === 'message');
    assert.deepEqual(text, { type: 'message', name: 'Alice', clientId: aliceJoin.clientId, text: '<b>hi</b>' });

    send(a, { type: 'image', dataUrl: PNG, caption: 'pic' });
    const img = await waitFor(b, (m) => m.type === 'image');
    assert.equal(img.dataUrl, PNG);
    assert.equal(img.caption, 'pic');

    a.ws.close();
    await waitFor(b, (m) => m.type === 'deregistration' && m.clientId === aliceJoin.clientId);
    b.ws.close();
});

test('rejects SVG and oversized images and tells the sender', async () => {
    const a = await registered('Alice');
    const b = await registered('Bob');
    await waitFor(b, (m) => m.name === 'Alice');

    send(a, { type: 'image', dataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' });
    await waitFor(a, (m) => m.type === 'error' && /Formato/.test(m.message));

    // exactly 5 MB is accepted, 5 MB + 1 byte is rejected
    send(a, { type: 'image', dataUrl: `data:image/png;base64,${base64OfBytes(5 * 1024 * 1024)}` });
    await waitFor(b, (m) => m.type === 'image');
    send(a, { type: 'image', dataUrl: `data:image/png;base64,${base64OfBytes(5 * 1024 * 1024 + 1)}` });
    await waitFor(a, (m) => m.type === 'error' && /grande/.test(m.message));
    await settle(a, b);
    assert.equal(b.inbox.filter((m) => m.type === 'image').length, 1);
    a.ws.close(); b.ws.close();
});

test('unregistered sockets can neither send nor eavesdrop', async () => {
    const spy = await open();
    const a = await registered('Alice');
    const b = await registered('Bob');
    await waitFor(b, (m) => m.name === 'Alice');

    send(spy, { type: 'message', text: 'anon' });
    await waitFor(spy, (m) => m.type === 'error');
    send(a, { type: 'message', text: 'secret' });
    await waitFor(b, (m) => m.text === 'secret');
    await settle(a, b);
    assert.ok(!spy.inbox.some((m) => m.type === 'message' || m.type === 'registration'));
    assert.ok(!b.inbox.some((m) => m.text === 'anon'));
    spy.ws.close(); a.ws.close(); b.ws.close();
});

test('clientId cannot be hijacked and re-registration leaves no ghosts', async () => {
    const a = await registered('Alice');
    const b = await registered('Bob');
    const aliceJoin = await waitFor(b, (m) => m.name === 'Alice');

    const m = await open();
    send(m, { type: 'registration', clientId: aliceJoin.clientId, name: 'Mallory' });
    const malloryJoin = await waitFor(b, (x) => x.name === 'Mallory');
    assert.notEqual(malloryJoin.clientId, aliceJoin.clientId);

    send(m, { type: 'registration', name: 'Mallory2' });
    const renamed = await waitFor(b, (x) => x.name === 'Mallory2');
    assert.equal(renamed.clientId, malloryJoin.clientId);
    m.ws.close();
    await waitFor(b, (x) => x.type === 'deregistration' && x.clientId === malloryJoin.clientId);
    a.ws.close(); b.ws.close();
});

test('strips invisible characters from names', async () => {
    const a = await registered('Ali​ce‮');
    const b = await registered('Bob');
    const join = await waitFor(b, (m) => m.type === 'registration' && m.clientId && m.name.startsWith('Ali'));
    assert.equal(join.name, 'Alice');
    a.ws.close(); b.ws.close();
});

test('rate limit blocks floods', async () => {
    const a = await registered('Flooder');
    for (let i = 0; i < 40; i += 1) send(a, { type: 'message', text: `m${i}` });
    await waitFor(a, (m) => m.type === 'error' && /troppi/.test(m.message));
    a.ws.close();
});

test('rejects WebSocket connections from other websites', async () => {
    await assert.rejects(open({ Origin: 'http://evil.example' }));
    const ok = await open({ Origin: `http://localhost:${PORT}` });
    ok.ws.close();
});
