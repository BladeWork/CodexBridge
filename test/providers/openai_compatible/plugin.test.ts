import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OpenAICompatibleProviderPlugin,
  buildOpenAICompatibleCodexCliArgs,
} from '../../../src/providers/openai_compatible/plugin.js';

function makeProfile(overrides = {}) {
  return {
    id: 'compat',
    providerKind: 'openai-compatible',
    displayName: 'OpenAI Compatible',
    config: {
      cliBin: 'codex',
      apiKeyEnv: 'OPENAI_COMPAT_API_KEY',
      baseUrl: 'https://example.com/v1',
      defaultModel: 'example-model',
      modelCatalog: [{
        id: 'example-model',
        model: 'example-model',
        displayName: 'Example Model',
        description: '',
        isDefault: true,
        supportedReasoningEfforts: ['low', 'medium'],
        defaultReasoningEffort: 'medium',
      }],
      ...overrides,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

test('buildOpenAICompatibleCodexCliArgs configures Codex app-server to use the local Responses adapter', () => {
  const args = buildOpenAICompatibleCodexCliArgs({
    providerLabel: 'example_provider',
    providerName: 'Example Provider',
    adapterBaseUrl: 'http://127.0.0.1:4321/v1',
    apiKeyEnv: 'EXAMPLE_API_KEY',
    defaultModel: 'example-model',
  });

  assert.deepEqual(args.slice(0, 4), ['-c', 'model="example-model"', '-c', 'model_provider="example_provider"']);
  assert.equal(args.includes('model_providers.example_provider.base_url="http://127.0.0.1:4321/v1"'), true);
  assert.equal(args.includes('model_providers.example_provider.wire_api="responses"'), true);
  assert.equal(args.includes('model_providers.example_provider.requires_openai_auth=false'), true);
});

test('OpenAICompatibleProviderPlugin can delegate normal provider operations through a Codex-like client', async () => {
  const calls: string[] = [];
  const plugin = new OpenAICompatibleProviderPlugin({
    defaults: {
      kind: 'example-provider',
      displayName: 'Example Provider',
      apiKeyEnv: 'EXAMPLE_API_KEY',
      baseUrl: 'https://example.com/v1',
      defaultModel: 'example-model',
      providerLabel: 'example_provider',
      modelIds: ['example-model'],
      ownedBy: 'example',
      upstreamChatCompletionsPath: '/chat/completions',
    },
    clientFactory: () => ({
      async start() {
        calls.push('start');
      },
      isConnected() {
        return true;
      },
      async listModels() {
        return [{
          id: 'example-model',
          model: 'example-model',
          displayName: 'Example Model',
          description: '',
          isDefault: true,
          supportedReasoningEfforts: ['low', 'medium'],
          defaultReasoningEffort: 'medium',
        }];
      },
      async startThread({ cwd, title, model }: any) {
        calls.push(`startThread:${model}`);
        return {
          threadId: 'thread-1',
          cwd,
          title,
        };
      },
      async stop() {},
    }),
  });

  const result = await plugin.startThread({
    providerProfile: makeProfile(),
    cwd: '/tmp/work',
    title: 'Example',
  });

  assert.equal(plugin.kind, 'example-provider');
  assert.deepEqual(calls, ['start', 'startThread:example-model']);
  assert.equal(result.threadId, 'thread-1');
});

test('OpenAICompatibleProviderPlugin resolves reasoning effort from explicit provider capabilities', () => {
  const plugin = new OpenAICompatibleProviderPlugin({
    defaults: {
      kind: 'example-provider',
      displayName: 'Example Provider',
      apiKeyEnv: 'EXAMPLE_API_KEY',
      baseUrl: 'https://example.com/v1',
      defaultModel: 'example-model',
      providerLabel: 'example_provider',
      modelIds: ['example-model'],
      ownedBy: 'example',
      upstreamChatCompletionsPath: '/chat/completions',
      capabilities: {
        thinking: {
          supportsReasoningEffortSelection: false,
          supportedReasoningEfforts: [],
          defaultReasoningEffort: null,
          stripFields: ['reasoning_effort'],
          mode: 'disabled',
          disabledThinkingValue: { type: 'disabled' },
        },
      },
    },
  });

  const effort = plugin.resolveReasoningEffort(makeProfile({
    capabilities: {
      thinking: {
        supportsReasoningEffortSelection: false,
      },
    },
  }) as any, {
    id: 'example-model',
    model: 'example-model',
    displayName: 'Example Model',
    description: '',
    isDefault: true,
    supportedReasoningEfforts: ['low', 'medium'],
    defaultReasoningEffort: 'medium',
  }, 'high');

  assert.equal(effort, null);
});
