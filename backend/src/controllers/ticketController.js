const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');

const PROVIDERS = Object.freeze(['bKash', 'nagad', 'rocket']);
const TICKET_STATUSES = Object.freeze(['New', 'Acknowledged', 'Closed']);
const ACTIVE_TICKET_STATUSES = new Set(['New', 'Acknowledged']);
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SENDER_ROLE_LENGTH = 50;

const dataFilePath = path.resolve(
  process.env.DATA_FILE_PATH ||
    path.join(__dirname, '..', 'database', 'data.json'),
);

// All read-modify-write operations share this queue. This prevents two
// simultaneous requests from reading the same version and losing one update.
let mutationQueue = Promise.resolve();

async function readData() {
  const rawData = await fs.readFile(dataFilePath, 'utf8');
  const data = JSON.parse(rawData);

  if (
    !data ||
    !Array.isArray(data.agents) ||
    !Array.isArray(data.tickets) ||
    !Array.isArray(data.messages)
  ) {
    throw new Error('The JSON data store has an invalid structure.');
  }

  return data;
}

async function writeData(data) {
  const directory = path.dirname(dataFilePath);
  const temporaryPath = `${dataFilePath}.${process.pid}.${randomUUID()}.tmp`;

  await fs.mkdir(directory, { recursive: true });

  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, dataFilePath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function mutateData(mutator) {
  const operation = mutationQueue.then(async () => {
    const data = await readData();
    const outcome = await mutator(data);

    if (outcome.changed) {
      await writeData(data);
    }

    return outcome.value;
  });

  // Keep the queue usable even when one operation fails.
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

function normalizeFromList(value, allowedValues) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  return (
    allowedValues.find(
      (allowedValue) => allowedValue.toLowerCase() === normalizedValue,
    ) || null
  );
}

function normalizeProvider(value) {
  return normalizeFromList(value, PROVIDERS);
}

function normalizeStatus(value) {
  return normalizeFromList(value, TICKET_STATUSES);
}

async function getActiveTickets(req, res) {
  const provider = normalizeProvider(req.query.provider);

  if (!provider) {
    return res.status(400).json({
      error: `provider must be one of: ${PROVIDERS.join(', ')}.`,
    });
  }

  const data = await readData();
  const tickets = data.tickets.filter(
    (ticket) =>
      normalizeProvider(ticket.assignedProvider) === provider &&
      ACTIVE_TICKET_STATUSES.has(ticket.status),
  );

  return res.status(200).json({ tickets });
}

async function updateTicketStatus(req, res) {
  const status = normalizeStatus(req.body?.status);

  if (!status) {
    return res.status(400).json({
      error: `status must be one of: ${TICKET_STATUSES.join(', ')}.`,
    });
  }

  const ticket = await mutateData((data) => {
    const storedTicket = data.tickets.find(
      (candidate) => candidate.ticketId === req.params.ticketId,
    );

    if (!storedTicket) {
      return { changed: false, value: null };
    }

    // Update only the allowed field; ignore any extra body properties.
    storedTicket.status = status;
    return { changed: true, value: { ...storedTicket } };
  });

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  return res.status(200).json({ ticket });
}

async function addMessage(req, res) {
  const senderRole =
    typeof req.body?.senderRole === 'string' ? req.body.senderRole.trim() : '';
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';

  if (!senderRole || senderRole.length > MAX_SENDER_ROLE_LENGTH) {
    return res.status(400).json({
      error: `senderRole is required and must be at most ${MAX_SENDER_ROLE_LENGTH} characters.`,
    });
  }

  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `text is required and must be at most ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  const message = await mutateData((data) => {
    const ticketExists = data.tickets.some(
      (ticket) => ticket.ticketId === req.params.ticketId,
    );

    if (!ticketExists) {
      return { changed: false, value: null };
    }

    // IDs and timestamps are always server-generated. Client-supplied values
    // for these fields are intentionally ignored.
    const newMessage = {
      messageId: `MESSAGE-${randomUUID()}`,
      ticketId: req.params.ticketId,
      senderRole,
      text,
      timestamp: new Date().toISOString(),
    };

    data.messages.push(newMessage);
    return { changed: true, value: { ...newMessage } };
  });

  if (!message) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  return res.status(201).json({ message });
}

async function getMessages(req, res) {
  const data = await readData();
  const ticketExists = data.tickets.some(
    (ticket) => ticket.ticketId === req.params.ticketId,
  );

  if (!ticketExists) {
    return res.status(404).json({ error: 'Ticket not found.' });
  }

  const messages = data.messages
    .filter((message) => message.ticketId === req.params.ticketId)
    .sort((first, second) =>
      first.timestamp.localeCompare(second.timestamp),
    );

  return res.status(200).json({ messages });
}

async function getOfficerView(req, res) {
  const provider = normalizeProvider(req.query.provider);

  if (!provider) {
    return res.status(400).json({
      error: `provider must be one of: ${PROVIDERS.join(', ')}.`,
    });
  }

  const data = await readData();
  const agent = data.agents.find(
    (candidate) => candidate.agentId === req.params.agentId,
  );

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found.' });
  }

  if (
    !Number.isFinite(agent.sharedPhysicalCash) ||
    !agent.eMoneyBalances ||
    !PROVIDERS.every((balanceProvider) =>
      Number.isFinite(agent.eMoneyBalances[balanceProvider]),
    )
  ) {
    throw new Error('The requested agent has invalid balance data.');
  }

  // Construct a strict response DTO instead of copying the stored record.
  // This guarantees that only the requesting provider's balance is exposed.
  const eMoneyBalances = Object.fromEntries(
    PROVIDERS.map((balanceProvider) => [
      balanceProvider,
      balanceProvider === provider
        ? agent.eMoneyBalances[balanceProvider]
        : 'HIDDEN',
    ]),
  );

  return res.status(200).json({
    agentId: agent.agentId,
    sharedPhysicalCash: agent.sharedPhysicalCash,
    eMoneyBalances,
  });
}

module.exports = {
  getActiveTickets,
  updateTicketStatus,
  addMessage,
  getMessages,
  getOfficerView,
};
