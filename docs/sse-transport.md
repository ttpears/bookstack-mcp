# SSE Transport Protocol

This document details the Server-Sent Events (SSE) transport implementation for the BookStack MCP server.

## Overview

The MCP server supports SSE transport for HTTP-based communication, enabling integration with web clients and Docker deployments. This is the recommended transport for LibreChat and other HTTP-based MCP clients.

## Architecture

### Persistent Bidirectional Connection

The SSE transport uses a persistent connection model:

```
┌─────────────┐                          ┌──────────────┐
│   Client    │                          │   MCP Server │
└─────────────┘                          └──────────────┘
      │                                         │
      │ GET /sse (opens persistent connection)  │
      ├────────────────────────────────────────>│
      │                                         │
      │ event: endpoint                         │
      │ data: /message?sessionId=<UUID>         │
      │<────────────────────────────────────────┤
      │ (connection stays open)                 │
      │                                         │
      │ POST /message (with sessionId)          │
      ├────────────────────────────────────────>│
      │ 202 Accepted                            │
      │<────────────────────────────────────────┤
      │                                         │
      │ event: message                          │
      │ data: {jsonrpc response}                │
      │<────────────────────────────────────────┤
      │ (connection remains open)               │
      │                                         │
```

### Key Concepts

1. **Session Lifecycle**: Sessions exist only while the GET `/sse` connection is open
2. **Session ID**: Extracted from the first `event: endpoint` SSE message
3. **Response Delivery**: Server sends `202 Accepted` immediately; actual response arrives via SSE stream
4. **Streaming**: Uses `handlePostMessage()` for efficient streaming without middleware conflicts

## Endpoints

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/health` | GET | Health check | None |
| `/sse` | GET | Establish SSE session | None |
| `/message` | POST | Send JSON-RPC messages | Session ID required |

## Implementation Details

### Transport Class

The server uses `SSEServerTransport` from `@modelcontextprotocol/sdk`:

```typescript
// src/sse-transport.ts
const transport = new SSEServerTransport("/message", res);
sessions.set(sessionId, transport);
```

### Session Management

- Sessions stored in `Map<sessionId, SSEServerTransport>`
- Session created on GET `/sse` request
- Session deleted when connection closes
- Session ID passed via `x-session-id` header or `?sessionId=` query param

### CORS Configuration

```typescript
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-session-id");
```

## Client Integration

### JavaScript/TypeScript

```typescript
// Using EventSource for SSE
const eventSource = new EventSource('http://localhost:8007/sse');

eventSource.addEventListener('endpoint', (event) => {
  const sessionId = new URL(event.data, 'http://localhost').searchParams.get('sessionId');
  // Store sessionId for POST requests
});

eventSource.addEventListener('message', (event) => {
  const response = JSON.parse(event.data);
  // Handle JSON-RPC response
});

// Send request
async function sendRequest(method: string, params: object) {
  const response = await fetch('http://localhost:8007/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    })
  });
  // Response comes via SSE stream, not this fetch
}
```

### cURL Testing

```bash
# Terminal 1: Keep SSE connection open
curl -N http://localhost:8007/sse

# Terminal 2: Send message (while Terminal 1 is open)
curl -X POST http://localhost:8007/message \
  -H "x-session-id: <session-id-from-terminal-1>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Python

```python
import requests
import sseclient
import threading
import json

session_id = None
responses = []

def sse_listener():
    global session_id
    response = requests.get('http://localhost:8007/sse', stream=True)
    client = sseclient.SSEClient(response)
    for event in client.events():
        if event.event == 'endpoint':
            session_id = event.data.split('sessionId=')[1].split('&')[0]
        elif event.event == 'message':
            responses.append(json.loads(event.data))

# Start listener thread
thread = threading.Thread(target=sse_listener, daemon=True)
thread.start()

# Wait for session
import time
while session_id is None:
    time.sleep(0.1)

# Send request
requests.post('http://localhost:8007/message',
    headers={'x-session-id': session_id, 'Content-Type': 'application/json'},
    json={'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list', 'params': {}})
```

## Troubleshooting

### "Session not found" (404)

**Cause**: SSE connection closed before sending message

**Solution**: Keep GET `/sse` connection open while sending POST `/message` requests

### Message returns 202 but no response

**Cause**: Not reading SSE stream after sending message

**Solution**: Ensure SSE stream reader is actively listening for `event: message`

### Cannot parse session ID

**Solution**: Check raw SSE stream format:
```bash
curl -N http://localhost:8007/sse | head -5
```

Expected output:
```
event: endpoint
data: /message?sessionId=<uuid>
```

## Performance

- **Health Check**: < 5ms
- **Session Establishment**: < 10ms  
- **Tools List**: ~30-100ms (includes MCP server processing)
- **Tool Calls**: Variable (depends on BookStack API response time)

## Related Files

- `src/sse-transport.ts` - Server implementation
- `src/index.ts` - Main entry point
