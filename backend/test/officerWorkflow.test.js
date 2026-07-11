const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'officer-api-test-'),
);
const temporaryDataFile = path.join(temporaryDirectory, 'data.json');
const sourceDataFile = path.join(
  __dirname,
  '..',
  'src',
  'database',
  'data.json',
);

fs.copyFileSync(sourceDataFile, temporaryDataFile);
process.env.DATA_FILE_PATH = temporaryDataFile;

const { app } = require('../src/server');

let server;
let baseUrl;

test.before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  await fsPromises.unlink(temporaryDataFile).catch(() => {});
  await fsPromises.rmdir(temporaryDirectory).catch(() => {});
});

async function request(route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

test('officer workflow API', async (t) => {
  await t.test('exposes only the scoped API', async () => {
    const health = await request('/health');
    const rawAgentRoute = await request('/agents/AGENT-001');
    const analyzeRoute = await request('/api/agent/AGENT-001/analyze', {
      method: 'POST',
    });

    assert.equal(health.status, 200);
    assert.equal(rawAgentRoute.status, 404);
    assert.equal(analyzeRoute.status, 404);
  });

  await t.test('returns only active tickets for the selected provider', async () => {
    const response = await request('/api/tickets?provider=NAGAD');

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.tickets.map((ticket) => ticket.ticketId),
      ['TICKET-1001'],
    );
    assert.ok(
      response.body.tickets.every(
        (ticket) =>
          ticket.assignedProvider === 'nagad' && ticket.status !== 'Closed',
      ),
    );

    assert.equal((await request('/api/tickets')).status, 400);
    assert.equal(
      (await request('/api/tickets?provider=not-a-provider')).status,
      400,
    );
  });

  await t.test('masks every competitor balance without mutating data', async () => {
    const before = await fsPromises.readFile(temporaryDataFile, 'utf8');
    const response = await request(
      '/api/agent/AGENT-001/officer-view?provider=nagad',
    );
    const after = await fsPromises.readFile(temporaryDataFile, 'utf8');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, {
      agentId: 'AGENT-001',
      sharedPhysicalCash: 8500,
      eMoneyBalances: {
        bKash: 'HIDDEN',
        nagad: 76000,
        rocket: 'HIDDEN',
      },
    });
    assert.equal(after, before);
    assert.equal(
      (await request('/api/agent/AGENT-001/officer-view?provider=invalid'))
        .status,
      400,
    );
    assert.equal(
      (await request('/api/agent/UNKNOWN/officer-view?provider=nagad'))
        .status,
      404,
    );
  });

  await t.test('persists status updates and ignores extra fields', async () => {
    const response = await request('/api/tickets/TICKET-1001/status', {
      method: 'PUT',
      body: JSON.stringify({
        status: 'closed',
        assignedProvider: 'rocket',
        ownerId: 'attacker',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ticket.status, 'Closed');
    assert.equal(response.body.ticket.assignedProvider, 'nagad');
    assert.equal(response.body.ticket.ownerId, 'nagad-officer-01');

    const storedData = JSON.parse(
      await fsPromises.readFile(temporaryDataFile, 'utf8'),
    );
    const storedTicket = storedData.tickets.find(
      (ticket) => ticket.ticketId === 'TICKET-1001',
    );
    assert.equal(storedTicket.status, 'Closed');

    const activeTickets = await request('/api/tickets?provider=nagad');
    assert.deepEqual(activeTickets.body.tickets, []);

    assert.equal(
      (
        await request('/api/tickets/TICKET-1001/status', {
          method: 'PUT',
          body: JSON.stringify({ status: 'invalid' }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request('/api/tickets/UNKNOWN/status', {
          method: 'PUT',
          body: JSON.stringify({ status: 'Closed' }),
        })
      ).status,
      404,
    );
  });

  await t.test('persists server-authored messages and returns history', async () => {
    const response = await request('/api/tickets/TICKET-1001/messages', {
      method: 'POST',
      body: JSON.stringify({
        senderRole: 'officer',
        text: '  Please confirm the amount needed.  ',
        messageId: 'CLIENT-CONTROLLED',
        timestamp: '2000-01-01T00:00:00.000Z',
      }),
    });

    assert.equal(response.status, 201);
    assert.match(response.body.message.messageId, /^MESSAGE-/);
    assert.notEqual(response.body.message.messageId, 'CLIENT-CONTROLLED');
    assert.equal(response.body.message.text, 'Please confirm the amount needed.');
    assert.notEqual(response.body.message.timestamp, '2000-01-01T00:00:00.000Z');

    const history = await request('/api/tickets/TICKET-1001/messages');
    assert.equal(history.status, 200);
    assert.equal(history.body.messages.length, 3);
    assert.deepEqual(
      [...history.body.messages].sort((first, second) =>
        first.timestamp.localeCompare(second.timestamp),
      ),
      history.body.messages,
    );

    assert.equal(
      (
        await request('/api/tickets/TICKET-1001/messages', {
          method: 'POST',
          body: JSON.stringify({ senderRole: 'officer', text: '   ' }),
        })
      ).status,
      400,
    );
    assert.equal(
      (await request('/api/tickets/UNKNOWN/messages')).status,
      404,
    );
  });

  await t.test('does not lose simultaneous message writes', async () => {
    const [first, second] = await Promise.all([
      request('/api/tickets/TICKET-1002/messages', {
        method: 'POST',
        body: JSON.stringify({ senderRole: 'officer', text: 'First update' }),
      }),
      request('/api/tickets/TICKET-1002/messages', {
        method: 'POST',
        body: JSON.stringify({ senderRole: 'agent', text: 'Second update' }),
      }),
    ]);

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const history = await request('/api/tickets/TICKET-1002/messages');
    assert.deepEqual(
      new Set(history.body.messages.map((message) => message.text)),
      new Set(['First update', 'Second update']),
    );
  });
});
