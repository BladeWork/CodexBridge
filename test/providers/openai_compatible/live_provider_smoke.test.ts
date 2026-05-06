import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpenAICompatibleProviderPreset } from '../../../src/providers/openai_compatible/capability_presets.js';
import { OpenAICompatibleResponsesAdapterServer } from '../../../src/providers/openai_compatible/responses_adapter_server.js';

type LiveProviderSpec = {
  presetId: string;
  name: string;
  apiKeyEnv: string[];
  baseUrlEnv: string[];
  modelEnv: string[];
  defaultBaseUrl: string;
  defaultModel: string;
};

const LIVE_FLAG = process.env.CODEXBRIDGE_TEST_LIVE_OPENAI_COMPATIBLE === '1';
const PROVIDERS: LiveProviderSpec[] = [{
  presetId: 'deepseek',
  name: 'DeepSeek',
  apiKeyEnv: ['DEEPSEEK_API_KEY'],
  baseUrlEnv: ['DEEPSEEK_BASE_URL'],
  modelEnv: ['DEEPSEEK_DEFAULT_MODEL', 'DEEPSEEK_MODEL'],
  defaultBaseUrl: 'https://api.deepseek.com',
  defaultModel: 'deepseek-chat',
}, {
  presetId: 'minimax',
  name: 'MiniMax',
  apiKeyEnv: ['MINIMAX_API_KEY', 'CODEXBRIDGE_AGENT_API_KEY'],
  baseUrlEnv: ['MINIMAX_BASE_URL', 'CODEXBRIDGE_AGENT_BASE_URL'],
  modelEnv: ['MINIMAX_MODEL', 'CODEXBRIDGE_AGENT_MODEL'],
  defaultBaseUrl: 'https://api.minimaxi.com/v1',
  defaultModel: 'MiniMax-M2.7',
}, {
  presetId: 'qwen',
  name: 'Qwen',
  apiKeyEnv: ['QWEN_API_KEY', 'DASHSCOPE_API_KEY'],
  baseUrlEnv: ['QWEN_BASE_URL', 'DASHSCOPE_BASE_URL'],
  modelEnv: ['QWEN_MODEL', 'DASHSCOPE_MODEL'],
  defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  defaultModel: 'qwen-plus',
}, {
  presetId: 'openrouter',
  name: 'OpenRouter',
  apiKeyEnv: ['OPENROUTER_API_KEY'],
  baseUrlEnv: ['OPENROUTER_BASE_URL'],
  modelEnv: ['OPENROUTER_MODEL'],
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openai/gpt-4o-mini',
}];

for (const provider of PROVIDERS) {
  const resolved = resolveProvider(provider);
  test(`live OpenAI-compatible adapter smoke: ${provider.name}`, {
    skip: skipReason(provider, resolved),
    timeout: 90_000,
  }, async () => {
    const preset = getOpenAICompatibleProviderPreset(provider.presetId);
    const server = new OpenAICompatibleResponsesAdapterServer({
      apiKey: resolved.apiKey,
      upstreamBaseUrl: resolved.baseUrl,
      defaultModel: resolved.model,
      models: [{ id: resolved.model }],
      providerName: provider.name,
      providerKind: 'openai-compatible',
      fetchImpl: ((input, init) => fetch(input, {
        ...init,
        signal: AbortSignal.timeout(60_000),
      })) as typeof fetch,
      providerCapabilities: preset.capabilities,
    });
    await server.start();
    try {
      const response = await fetch(`${server.baseUrl}/v1/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: resolved.model,
          input: 'Reply with exactly: OK',
          max_output_tokens: 16,
          stream: false,
        }),
        signal: AbortSignal.timeout(70_000),
      });
      const text = await response.text();
      assert.equal(response.status, 200, `${provider.name} status ${response.status}: ${text.slice(0, 1000)}`);
      const body = JSON.parse(text);
      const outputText = collectResponseOutputText(body);
      assert.match(outputText, /\bOK\b/i, `${provider.name} output did not contain OK: ${outputText}`);
    } finally {
      await server.stop();
    }
  });
}

function skipReason(provider: LiveProviderSpec, resolved: ResolvedProvider): string | false {
  if (!LIVE_FLAG) {
    return 'set CODEXBRIDGE_TEST_LIVE_OPENAI_COMPATIBLE=1 to run live provider smoke tests';
  }
  if (!resolved.apiKey) {
    return `missing API key env: ${provider.apiKeyEnv.join(' or ')}`;
  }
  return false;
}

type ResolvedProvider = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

function resolveProvider(provider: LiveProviderSpec): ResolvedProvider {
  return {
    apiKey: firstEnv(provider.apiKeyEnv),
    baseUrl: firstEnv(provider.baseUrlEnv) || provider.defaultBaseUrl,
    model: firstEnv(provider.modelEnv) || provider.defaultModel,
  };
}

function firstEnv(names: string[]): string {
  for (const name of names) {
    const value = normalizeString(process.env[name]);
    if (value) {
      return value;
    }
  }
  return '';
}

function collectResponseOutputText(response: any): string {
  const parts: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
