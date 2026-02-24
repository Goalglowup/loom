# Loom Gateway — Getting Started

## Prerequisites

- Node 18+
- Docker (for PostgreSQL)

---

## 1. Start the gateway

```bash
# Clone the repo and enter the project root
cp .env.example .env        # add your OPENAI_API_KEY, or leave blank for Ollama
docker compose up -d postgres
npm install
npm run migrate:up
npm run seed                 # prints your API key — copy it!
npm start
```

The gateway listens on **http://localhost:3000** by default.

---

## 2. Open the chat app

Open `examples/chat/index.html` in your browser, paste the API key printed by
`npm run seed`, then start chatting.

---

## 3. (Optional) Point at Ollama instead of OpenAI

Run Ollama locally (`ollama serve`), then update the `dev` tenant's
provider config directly in the database:

```sql
UPDATE tenants
SET provider_config = '{
  "provider": "openai",
  "apiKey":   "ollama",
  "baseUrl":  "http://localhost:11434/v1"
}'
WHERE name = 'dev';
```

Restart the gateway (`npm start`) so the provider cache is refreshed.

---

## 4. Verify

```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```
