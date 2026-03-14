# @arachne/chat

Embeddable React chat component for [Arachne](https://github.com/Synaptic-Weave/arachne) agents.

Connects directly to the Arachne gateway API — no portal dependency. Supports markdown rendering, RAG source citations, conversation memory, model selection, and token usage stats.

## Install

```bash
npm install @arachne/chat
```

## Usage

```tsx
import { ArachneChat } from '@arachne/chat';
import '@arachne/chat/styles.css';

function App() {
  return (
    <ArachneChat
      apiKey="loom_sk_..."
      baseUrl="https://your-arachne-instance.com"
      model="gpt-4o-mini"
      title="Support Agent"
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `apiKey` | `string` | **required** | Arachne gateway API key |
| `baseUrl` | `string` | `''` | Gateway base URL |
| `model` | `string` | `'gpt-4o-mini'` | Default model |
| `models` | `string[]` | `[]` | Model picker options |
| `title` | `string` | `'Chat'` | Header title |
| `memory` | `boolean` | `false` | Enable conversation memory |
| `conversationId` | `string` | — | Resume a conversation |
| `partitionId` | `string` | — | Partition for multi-tenant |
| `showModelPicker` | `boolean` | `true` | Show model dropdown |
| `showUsage` | `boolean` | `true` | Show token stats |
| `showSources` | `boolean` | `true` | Show RAG citations |
| `placeholder` | `string` | `'Type a message…'` | Input placeholder |
| `className` | `string` | — | CSS class on container |
| `onMessage` | `(msg) => void` | — | Message callback |
| `onError` | `(err) => void` | — | Error callback |

## Headless usage

Use the client directly without the UI component:

```ts
import { sendChatCompletion } from '@arachne/chat';

const res = await sendChatCompletion('https://gateway.example.com', 'loom_sk_...', {
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

console.log(res.choices[0].message.content);
console.log(res.rag_sources); // RAG citations if KB attached
```

## Styling

Import the default dark theme:

```ts
import '@arachne/chat/styles.css';
```

All elements use BEM-style `.arachne-chat-*` class names — override any class to customize.
