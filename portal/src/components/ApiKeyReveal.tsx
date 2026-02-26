import { useState } from 'react';
import type { ApiKeyCreated } from '../lib/api';

interface Props {
  keyData: ApiKeyCreated;
  onDismiss: () => void;
}

export default function ApiKeyReveal({ keyData, onDismiss }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(keyData.key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-yellow-600 bg-yellow-950/30 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-yellow-400 text-xl">⚠️</span>
        <div>
          <p className="font-semibold text-yellow-300">Save this API key now</p>
          <p className="text-sm text-yellow-400/80 mt-0.5">
            It won't be shown again. Copy it and store it somewhere safe.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-green-400 truncate">
          {keyData.key}
        </code>
        <button
          onClick={handleCopy}
          className="shrink-0 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      <div className="text-xs text-gray-400">
        Key name: <span className="text-gray-200">{keyData.name}</span>
        {' · '}Prefix: <span className="font-mono text-gray-200">{keyData.keyPrefix}</span>
      </div>

      <button
        onClick={onDismiss}
        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        I've saved it — continue
      </button>
    </div>
  );
}
