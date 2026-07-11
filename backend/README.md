# Super Agent Officer Workflow API

This Express backend implements only the officer workflow for existing
liquidity tickets. It does not analyze balances or create tickets. Agents,
tickets, and messages are read from and written to
`src/database/data.json`; no database server is required.

## Run locally

```bash
npm install
npm start
```

The API listens on `http://localhost:3000` by default. Set `PORT` in `.env`
to use another port. Runtime changes persist in `data.json` and survive a
server restart.

## Endpoints

### Fetch active provider tickets

```http
GET /api/tickets?provider=nagad
```

Only `New` and `Acknowledged` tickets are returned. Provider values are
case-insensitive and must be `bKash`, `nagad`, or `rocket`.

### Update ticket status

```http
PUT /api/tickets/TICKET-1001/status
Content-Type: application/json

{
  "status": "Acknowledged",
  "ownerId": "nagad-officer-02"
}
```

Valid statuses are `New`, `Acknowledged`, and `Closed`. `ownerId` is optional;
include it when an officer claims the ticket.

### Fetch one ticket

```http
GET /api/tickets/TICKET-1001
```

### Add and retrieve ticket messages

```http
POST /api/tickets/TICKET-1001/messages
Content-Type: application/json

{
  "senderRole": "officer",
  "text": "Can you confirm your current cash requirement?"
}
```

```http
GET /api/tickets/TICKET-1001/messages
```

The server generates every message ID and timestamp.

### Secure officer view

```http
GET /api/agent/AGENT-001/officer-view?provider=nagad
```

Example response:

```json
{
  "agentId": "AGENT-001",
  "sharedPhysicalCash": 8500,
  "eMoneyBalances": {
    "bKash": "HIDDEN",
    "nagad": 76000,
    "rocket": "HIDDEN"
  }
}
```

The response is constructed from an explicit allowlist and never returns the
stored agent object, so competitor balances remain hidden.

## Prototype storage note

File updates are serialized inside the Node.js process and saved through a
temporary file before replacement. Run a single server process when using
this JSON-file store. A production deployment should use authentication to
derive the officer's provider from trusted credentials rather than a query
parameter.
