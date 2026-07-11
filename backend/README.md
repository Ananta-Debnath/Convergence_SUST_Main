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

## Anomaly alert endpoints

- `GET /agents/:id/alerts` analyzes the stored agent's recent transactions.
- `POST /alerts/analyze` analyzes supplied live or historical transaction data.

Example request:

```json
{
  "agent_id": "AGT-8472",
  "use_gemini": true,
  "transactions": [
    {
      "transaction_id": "TXN-1",
      "provider_id": "Nagad",
      "user_id": "USER-1",
      "wallet_id": "WALLET-1",
      "time": "2026-07-11T11:20:00Z",
      "transaction_type": "cash-out",
      "amount": 9999,
      "status": "success"
    }
  ]
}
```

The response contains deterministic pattern evidence, transaction IDs, and a
severity object with `score`, `level`, and `factors`. `user_id` is needed for
user-level splitting and velocity rules.

Dashboard-ready anomaly alerts stay directly on the responsible entity:
`agent.anomality_alert` contains user-level anomalies, while
`manager.anomality_alert` contains agent-level anomalies. There is no shared
inbox or top-level anomaly queue. Both fields remain separate from the existing
`active_alerts` liquidity-alert queue.

Set `GEMINI_API_KEY` to enable Gemini-generated `subject`, `evidence`,
`context`, `recommended_action`, `message_en`, `message_bn`, and
`message_banglish` fields. All three localized paragraphs communicate the same
evidence, uncertainty, and human-review step. If the key is absent, the request
times out, or generated text fails safe-language validation, the API returns
deterministic messages in all three formats. Pass `use_gemini=false` to avoid
an external call.

## Health endpoints

File updates are serialized inside the Node.js process and saved through a
temporary file before replacement. Run a single server process when using
this JSON-file store. A production deployment should use authentication to
derive the officer's provider from trusted credentials rather than a query
parameter.
