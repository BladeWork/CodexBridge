import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAICompatibleResponsesAdapterServer } from '../../../src/providers/openai_compatible/responses_adapter_server.js';

test('OpenAICompatibleResponsesAdapterServer synthesizes compact responses when upstream compact is unsupported', async () => {
  let fetchCalls = 0;
  const server = new OpenAICompatibleResponsesAdapterServer({
    apiKey: 'test-key',
    fetchImpl: (async () => {
      fetchCalls += 1;
      return new Response('{}');
    }) as typeof fetch,
    providerCapabilities: {
      supportsResponsesCompact: false,
      usage: {
        estimateWhenMissing: true,
      },
    },
  });
  await server.start();
  try {
    const response = await fetch(`${server.baseUrl}/v1/responses/compact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'example-model',
        input: 'hello',
      }),
    });
    const body = await response.json() as any;
    assert.equal(response.status, 200);
    assert.equal(fetchCalls, 0);
    assert.equal(body.object, 'response.compaction');
    assert.equal(body.output[0].content[0].text, 'hello');
  } finally {
    await server.stop();
  }
});

test('OpenAICompatibleResponsesAdapterServer passes compact requests through when provider supports compact', async () => {
  let capturedUrl = '';
  let capturedBody: any = null;
  const server = new OpenAICompatibleResponsesAdapterServer({
    apiKey: 'test-key',
    upstreamBaseUrl: 'https://provider.example/v1',
    fetchImpl: (async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body ?? '{}'));
      return new Response(JSON.stringify({
        id: 'resp_1',
        object: 'response.compaction',
        created_at: 1234,
        output: [],
        usage: null,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch,
    providerCapabilities: {
      supportsResponsesCompact: true,
      upstreamResponsesCompactPath: '/responses/compact',
    },
  });
  await server.start();
  try {
    const response = await fetch(`${server.baseUrl}/v1/responses/compact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'example-model',
        input: 'hello',
        stream: false,
      }),
    });
    const body = await response.json() as any;
    assert.equal(response.status, 200);
    assert.equal(capturedUrl, 'https://provider.example/v1/responses/compact');
    assert.equal(capturedBody.stream, undefined);
    assert.equal(body.object, 'response.compaction');
  } finally {
    await server.stop();
  }
});

test('OpenAICompatibleResponsesAdapterServer exposes model capability metadata in /models', async () => {
  const server = new OpenAICompatibleResponsesAdapterServer({
    apiKey: 'test-key',
    models: [{
      id: 'example-model',
      capabilities: {
        tools: true,
        vision: false,
        maxOutputTokens: 4096,
      },
    }],
  });
  await server.start();
  try {
    const response = await fetch(`${server.baseUrl}/v1/models`);
    const body = await response.json() as any;
    assert.equal(response.status, 200);
    assert.equal(body.data[0].id, 'example-model');
    assert.deepEqual(body.data[0].capabilities, {
      tools: true,
      vision: false,
      maxOutputTokens: 4096,
    });
  } finally {
    await server.stop();
  }
});
