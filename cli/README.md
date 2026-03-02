# Arachne CLI (`@arachne/cli`)

The official command-line interface for [Arachne](https://arachne-ai.com) — the AI runtime built for builders who ship.

## Installation

```bash
npm install -g @arachne/cli
```

## Quick start

```bash
# 1. Configure your gateway URL and API token
arachne init

# 2. Or log in interactively with email + password
arachne login

# 3. Weave an agent definition from a local file
arachne weave

# 4. Push a packaged artifact to the Arachne registry
arachne push

# 5. Deploy an artifact from the registry to an environment
arachne deploy
```

## Commands

| Command | Description |
|---------|-------------|
| `arachne init` | Interactive setup wizard. Prompts for your gateway URL and API token, then saves them to `~/.arachne/config.json`. |
| `arachne login` | Authenticate with email and password. Fetches a session token from your configured gateway and saves it locally. |
| `arachne weave` | Compile and validate a local agent definition (`.weave` file) into a deployable artifact. |
| `arachne push` | Package and push a compiled artifact to the Arachne registry. |
| `arachne deploy` | Deploy a registry artifact to a named environment (e.g. `production`, `staging`). |

## Configuration

Config is stored at `~/.arachne/config.json`. You can also use environment variables:

| Variable | Description |
|----------|-------------|
| `ARACHNE_GATEWAY_URL` | Override the gateway URL without editing the config file. |
| `ARACHNE_TOKEN` | Override the API token (useful for CI). |

## Documentation

Full docs at **https://arachne-ai.com/docs**
