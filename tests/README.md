# Test Infrastructure

## Overview

This directory contains the test infrastructure for Loom, including mock servers, database fixtures, and integration tests.

## Structure

```
tests/
├── mocks/                          # Mock external services
│   ├── mock-openai-server.ts       # OpenAI-compatible mock server
│   └── mock-azure-openai-server.ts # Azure OpenAI-compatible mock server
├── fixtures/                       # Test fixtures and utilities
│   └── test-database.ts            # PostgreSQL test database utilities
└── integration/                    # Integration tests
    ├── mock-openai-server.test.ts
    ├── mock-azure-openai-server.test.ts
    └── test-database.test.ts
```

## Mock Servers

### MockOpenAIServer

Simulates OpenAI API for testing:
- Non-streaming completions
- Streaming (SSE) completions
- Health check endpoint
- Returns canned responses with realistic structure

**Default Port:** 3001

### MockAzureOpenAIServer

Simulates Azure OpenAI API for testing:
- Non-streaming completions
- Streaming (SSE) completions
- Health check endpoint
- Azure-specific URL patterns (`/openai/deployments/{id}/chat/completions`)

**Default Port:** 3002

## Database Fixtures

### TestDatabaseFixture

Utilities for test database management:
- Schema creation (tenants, traces tables)
- Seed data insertion
- Cleanup and teardown
- Query execution

**Configuration via Environment Variables:**
- `TEST_DB_HOST` (default: localhost)
- `TEST_DB_PORT` (default: 5432)
- `TEST_DB_USER` (default: postgres)
- `TEST_DB_PASSWORD` (default: postgres)
- `TEST_DB_NAME` (default: loom_test)
- `TEST_DB_ENABLED` (set to '1' to enable database tests)

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Database Tests

Database tests are **skipped by default** to allow tests to run without PostgreSQL.

To enable database tests:

```bash
# Ensure PostgreSQL is running
# Create test database
createdb loom_test

# Enable database tests
export TEST_DB_ENABLED=1

# Run tests
npm test
```

## Usage Examples

### Using Mock Servers in Tests

```typescript
import { MockOpenAIServer } from '../mocks/mock-openai-server';

let server: MockOpenAIServer;

beforeAll(async () => {
  server = new MockOpenAIServer({ port: 3001 });
  await server.start();
});

afterAll(async () => {
  await server.stop();
});

it('should call mock OpenAI', async () => {
  const response = await fetch(`${server.getBaseURL()}/v1/chat/completions`, {
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    })
  });
  // assertions...
});
```

### Using Database Fixtures

```typescript
import { TestDatabaseFixture } from '../fixtures/test-database';

let db: TestDatabaseFixture;

beforeAll(async () => {
  db = new TestDatabaseFixture();
  await db.connect();
  await db.createSchema();
});

afterAll(async () => {
  await db.teardown();
  await db.disconnect();
});

it('should query database', async () => {
  await db.seed();
  const result = await db.query('SELECT * FROM tenants');
  // assertions...
});
```

## Next Steps

Wave 2-3 will add integration tests for:
- Gateway proxy endpoints
- Streaming validation
- Trace completeness
- Multi-tenant isolation
- Performance benchmarks
