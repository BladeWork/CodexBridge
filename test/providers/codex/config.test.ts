import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadCodexProfilesFromEnv, resolveCommand } from '../../../src/providers/codex/config.js';

test('loadCodexProfilesFromEnv keeps Codex OpenAI as the default profile', () => {
  const result = loadCodexProfilesFromEnv({
    CODEX_REAL_BIN: '/usr/bin/codex',
    CODEX_COMPAT_PROVIDER_ID: 'compat-example',
    CODEX_COMPAT_PROVIDER_NAME: 'Compatible Example',
    CODEX_COMPAT_API_KEY: 'sk-test',
    CODEX_COMPAT_BASE_URL: 'https://provider.example/v1',
    CODEX_COMPAT_DEFAULT_MODEL: 'example-model',
  });

  assert.equal(result.defaultProviderProfileId, 'openai-default');
  assert.equal(result.profiles[0]?.providerKind, 'openai-native');
  assert.equal(result.profiles[0]?.config.cliBin, '/usr/bin/codex');
  assert.equal(result.profiles[1]?.id, 'compat-example');
  assert.equal(result.profiles[1]?.providerKind, 'openai-compatible');
  assert.equal(result.profiles[1]?.config.apiKeyEnv, 'CODEX_COMPAT_API_KEY');
  assert.equal(result.profiles[1]?.config.baseUrl, 'https://provider.example/v1');
  assert.equal(result.profiles[1]?.config.defaultModel, 'example-model');
});

test('loadCodexProfilesFromEnv exposes DeepSeek through the generic OpenAI-compatible profile loader', () => {
  const result = loadCodexProfilesFromEnv({
    CODEX_REAL_BIN: '/usr/bin/codex',
    CODEX_DEFAULT_PROVIDER_PROFILE_ID: 'deepseek',
    DEEPSEEK_API_KEY: 'sk-test',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    DEEPSEEK_DEFAULT_MODEL: 'deepseek-v4-pro',
  });

  const profile = result.profiles.find((entry) => entry.id === 'deepseek');
  assert.equal(result.defaultProviderProfileId, 'deepseek');
  assert.equal(profile?.providerKind, 'openai-compatible');
  assert.equal(profile?.displayName, 'DeepSeek');
  assert.equal(profile?.config.cliBin, '/usr/bin/codex');
  assert.equal(profile?.config.apiKeyEnv, 'DEEPSEEK_API_KEY');
  assert.equal(profile?.config.baseUrl, 'https://api.deepseek.com');
  assert.equal(profile?.config.defaultModel, 'deepseek-v4-pro');
  assert.equal(profile?.config.providerLabel, 'deepseek');
  assert.equal(profile?.config.capabilities?.supportsBuiltinWebSearchTool, false);
  assert.equal(profile?.config.modelCatalogMode, 'overlay-only');
});

test('loadCodexProfilesFromEnv exposes MiniMax through the generic OpenAI-compatible profile loader', () => {
  const result = loadCodexProfilesFromEnv({
    CODEX_REAL_BIN: '/usr/bin/codex',
    CODEX_DEFAULT_PROVIDER_PROFILE_ID: 'minimax',
    MINIMAX_API_KEY: 'sk-test',
    MINIMAX_BASE_URL: 'https://api.minimaxi.com/v1',
    MINIMAX_MODEL: 'MiniMax-M2.7',
  });

  const profile = result.profiles.find((entry) => entry.id === 'minimax');
  assert.equal(result.defaultProviderProfileId, 'minimax');
  assert.equal(profile?.providerKind, 'openai-compatible');
  assert.equal(profile?.displayName, 'MiniMax');
  assert.equal(profile?.config.cliBin, '/usr/bin/codex');
  assert.equal(profile?.config.apiKeyEnv, 'MINIMAX_API_KEY');
  assert.equal(profile?.config.baseUrl, 'https://api.minimaxi.com/v1');
  assert.equal(profile?.config.defaultModel, 'MiniMax-M2.7');
  assert.equal(profile?.config.providerLabel, 'minimax');
  assert.equal(profile?.config.capabilities?.supportsBuiltinWebSearchTool, false);
  assert.equal(profile?.config.modelCatalogMode, 'overlay-only');
});

test('loadCodexProfilesFromEnv exposes additional CLIProxy-style compatible presets', () => {
  const result = loadCodexProfilesFromEnv({
    CODEX_REAL_BIN: '/usr/bin/codex',
    KIMI_API_KEY: 'sk-kimi',
    GEMINI_API_KEY: 'sk-gemini',
    IFLOW_API_KEY: 'sk-iflow',
  });

  const kimi = result.profiles.find((entry) => entry.id === 'kimi');
  const gemini = result.profiles.find((entry) => entry.id === 'gemini');
  const iflow = result.profiles.find((entry) => entry.id === 'iflow');
  assert.equal(kimi?.providerKind, 'openai-compatible');
  assert.equal(kimi?.config.baseUrl, 'https://api.kimi.com/coding');
  assert.equal(kimi?.config.defaultModel, 'kimi-k2');
  assert.equal(gemini?.providerKind, 'openai-compatible');
  assert.equal(gemini?.config.defaultModel, 'gemini-2.5-pro');
  assert.equal(iflow?.providerKind, 'openai-compatible');
  assert.equal(iflow?.config.defaultModel, 'qwen3-coder-plus');
});

test('resolveCommand prefers codex.exe before wrapper scripts on Windows', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-config-win-path-'));
  fs.writeFileSync(path.join(tempDir, 'codex.cmd'), '@echo off\r\n');
  fs.writeFileSync(path.join(tempDir, 'codex.exe'), 'binary');

  const resolved = resolveCommand('codex', {
    platform: 'win32',
    env: {
      PATH: tempDir,
      PATHEXT: '.CMD;.EXE',
    } as NodeJS.ProcessEnv,
    cwd: tempDir,
  });

  assert.equal(resolved, path.join(tempDir, 'codex.exe'));
});

test('resolveCommand falls back to codex.cmd on Windows when no native executable is present', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-config-win-cmd-'));
  fs.writeFileSync(path.join(tempDir, 'codex.cmd'), '@echo off\r\n');

  const resolved = resolveCommand('codex', {
    platform: 'win32',
    env: {
      PATH: tempDir,
      PATHEXT: '.CMD;.BAT',
    } as NodeJS.ProcessEnv,
    cwd: tempDir,
  });

  assert.equal(resolved, path.join(tempDir, 'codex.cmd'));
});

test('loadCodexProfilesFromEnv resolves explicit Windows command overrides without requiring the extension', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexbridge-config-win-override-'));
  const toolDir = path.join(tempDir, 'tools');
  fs.mkdirSync(toolDir, { recursive: true });
  fs.writeFileSync(path.join(toolDir, 'codex.cmd'), '@echo off\r\n');

  const result = loadCodexProfilesFromEnv({
    CODEX_REAL_BIN: '.\\tools\\codex',
  } as NodeJS.ProcessEnv, {
    platform: 'win32',
    cwd: tempDir,
  });

  assert.equal(result.profiles[0]?.config.cliBin, path.join(toolDir, 'codex.cmd'));
});
