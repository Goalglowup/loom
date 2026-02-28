# Running Loom Locally

## Prerequisites

- Node.js >= 25.2.1
- Docker (for PostgreSQL)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start PostgreSQL:**
   ```bash
   docker compose up -d
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env if needed
   ```

4. **Run migrations:**
   ```bash
   npm run migrate:up
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`.

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm run start` - Start production server
- `npm run migrate:up` - Run pending migrations
- `npm run migrate:down` - Rollback last migration
- `npm run migrate:create <name>` - Create new migration
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage

## Development Notes

- The project uses TypeScript with strict mode enabled
- The database uses PostgreSQL with native partitioning for the traces table
- Framework: Fastify (HTTP server)
- HTTP Client: undici (upstream provider requests)
- Migrations: node-pg-migrate
