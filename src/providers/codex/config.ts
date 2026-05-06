import fs from 'node:fs';
import path from 'node:path';
import {
  buildOpenAICompatibleModelCatalog,
  getOpenAICompatibleProviderPreset,
} from '../openai_compatible/capability_presets.js';
import {
  mergeOpenAICompatibleProviderCapabilities,
  type OpenAICompatibleProviderCapabilities,
} from '../shared/thinking_policy.js';
import type { ProviderProfile } from '../../types/provider.js';

interface CodexProviderConfig {
  cliBin: string;
  launchCommand: string | null;
  autolaunch: boolean;
  defaultModel: string | null;
  providerLabel: string;
  backendBaseUrl: string | null;
  apiKeyEnv: string | null;
  baseUrl: string | null;
  modelCatalogPath: string | null;
  modelCatalog: unknown[];
  modelCatalogMode: 'merge' | 'overlay-only';
  upstreamChatCompletionsPath: string | null;
  ownedBy: string | null;
  capabilities: OpenAICompatibleProviderCapabilities | null;
}

type CodexProviderProfile = ProviderProfile & {
  providerKind: string;
  config: Record<string, unknown> & Partial<CodexProviderConfig>;
};

interface CodexProfilesConfig {
  profiles: CodexProviderProfile[];
  defaultProviderProfileId: string;
}

interface CodexConfigLoadOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export function loadCodexProfilesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  {
    platform = process.platform,
    cwd = process.cwd(),
  }: CodexConfigLoadOptions = {},
): CodexProfilesConfig {
  const codexRealBin = resolveConfiguredCommand(normalizeString(env.CODEX_REAL_BIN), {
    platform,
    env,
    cwd,
  }) ?? resolveCommand('codex', {
    platform,
    env,
    cwd,
  }) ?? 'codex';
  const now = Date.now();
  const profiles: CodexProviderProfile[] = [
    {
      id: 'openai-default',
      providerKind: 'openai-native',
      displayName: 'Codex OpenAI',
      config: {
        cliBin: codexRealBin,
        launchCommand: normalizeString(env.CODEX_APP_LAUNCH_CMD),
        autolaunch: parseBoolean(env.CODEX_APP_AUTOLAUNCH, false),
        defaultModel: null,
        providerLabel: 'openai',
        backendBaseUrl: null,
        apiKeyEnv: null,
        baseUrl: null,
        modelCatalogPath: null,
        modelCatalog: [],
        modelCatalogMode: 'merge',
        upstreamChatCompletionsPath: null,
        ownedBy: null,
        capabilities: null,
      },
      createdAt: now,
      updatedAt: now,
    },
  ];

  pushProfile(profiles, buildPresetOpenAICompatibleProfile({
    presetId: 'deepseek',
    prefix: 'DEEPSEEK',
    env,
    codexRealBin,
    now,
  }));
  pushProfile(profiles, buildPresetOpenAICompatibleProfile({
    presetId: 'minimax',
    prefix: 'MINIMAX',
    env,
    codexRealBin,
    now,
  }));
  pushProfile(profiles, buildPresetOpenAICompatibleProfile({
    presetId: 'qwen',
    prefix: 'QWEN',
    env,
    codexRealBin,
    now,
    alternativeApiKeyEnv: 'DASHSCOPE_API_KEY',
    alternativeBaseUrlEnv: 'DASHSCOPE_BASE_URL',
    alternativeModelEnv: 'DASHSCOPE_MODEL',
  }));
  pushProfile(profiles, buildPresetOpenAICompatibleProfile({
    presetId: 'openrouter',
    prefix: 'OPENROUTER',
    env,
    codexRealBin,
    now,
  }));
  pushProfile(profiles, buildPresetOpenAICompatibleProfile({
    presetId: 'kimi',
    prefix: 'KIMI',
    env,
    codexRealBin,
    now,
  }));
  pushProfile(profiles, buildPresetOpenAICompatibleProfile({
    presetId: 'gemini',
    prefix: 'GEMINI',
    env,
    codexRealBin,
    now,
  }));
  pushProfile(profiles, buildPresetOpenAICompatibleProfile({
    presetId: 'iflow',
    prefix: 'IFLOW',
    env,
    codexRealBin,
    now,
  }));
  pushProfile(profiles, buildCustomOpenAICompatibleProfile({
    env,
    codexRealBin,
    now,
  }));
  pushProfile(profiles, buildLegacyOpenAICompatibleProfile({
    env,
    codexRealBin,
    now,
  }));

  const requestedDefaultId = normalizeString(env.CODEX_DEFAULT_PROVIDER_PROFILE_ID);
  const defaultProviderProfileId = profiles.some((profile) => profile.id === requestedDefaultId)
    ? requestedDefaultId
    : profiles[0]?.id
      ?? 'openai-default';

  return {
    profiles,
    defaultProviderProfileId,
  };
}

export function resolveCommand(
  command: string,
  {
    platform = process.platform,
    env = process.env,
    cwd = process.cwd(),
  }: CodexConfigLoadOptions = {},
): string | null {
  const normalizedCommand = normalizeString(command);
  if (!normalizedCommand) {
    return null;
  }
  const explicit = resolveExplicitCommandPath(normalizedCommand, {
    platform,
    env,
    cwd,
  });
  if (explicit) {
    return explicit;
  }
  if (hasPathSeparator(normalizedCommand)) {
    return null;
  }
  const pathEntries = splitPathEntries(resolvePathValue(env));
  const suffixes = resolveCommandSuffixes(platform, env, normalizedCommand);
  for (const entry of pathEntries) {
    for (const suffix of suffixes) {
      const candidate = path.join(entry, `${normalizedCommand}${suffix}`);
      if (isCommandFile(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function loadModelCatalog(modelCatalogPath: string | null): unknown[] {
  if (!modelCatalogPath) {
    return [];
  }
  try {
    const resolvedPath = path.resolve(modelCatalogPath);
    if (!fs.existsSync(resolvedPath)) {
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function pushProfile(profiles: CodexProviderProfile[], profile: CodexProviderProfile | null): void {
  if (!profile) {
    return;
  }
  if (profiles.some((entry) => entry.id === profile.id)) {
    return;
  }
  profiles.push(profile);
}

function normalizeString(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return String(value).trim() !== 'false' && String(value).trim() !== '0';
}

function buildPresetOpenAICompatibleProfile({
  presetId,
  prefix,
  env,
  codexRealBin,
  now,
  alternativeApiKeyEnv = null,
  alternativeBaseUrlEnv = null,
  alternativeModelEnv = null,
}: {
  presetId: string;
  prefix: string;
  env: NodeJS.ProcessEnv;
  codexRealBin: string;
  now: number;
  alternativeApiKeyEnv?: string | null;
  alternativeBaseUrlEnv?: string | null;
  alternativeModelEnv?: string | null;
}): CodexProviderProfile | null {
  const preset = getOpenAICompatibleProviderPreset(presetId);
  const apiKeyEnv = normalizeString(env[`${prefix}_API_KEY_ENV`])
    ?? (alternativeApiKeyEnv && normalizeString(env[alternativeApiKeyEnv]) ? alternativeApiKeyEnv : null)
    ?? preset.apiKeyEnv;
  const defaultModel = normalizeString(env[`${prefix}_PROVIDER_DEFAULT_MODEL`])
    ?? normalizeString(env[`${prefix}_DEFAULT_MODEL`])
    ?? normalizeString(env[`${prefix}_MODEL`])
    ?? (alternativeModelEnv ? normalizeString(env[alternativeModelEnv]) : null)
    ?? resolveAgentModelFallbackForBaseUrl(env, preset.baseUrl)
    ?? preset.defaultModel;
  const baseUrl = normalizeString(env[`${prefix}_BASE_URL`])
    ?? (alternativeBaseUrlEnv ? normalizeString(env[alternativeBaseUrlEnv]) : null)
    ?? preset.baseUrl;
  const shouldExpose = Boolean(
    hasEnvValue(env, apiKeyEnv)
    || normalizeString(env[`${prefix}_PROVIDER_ID`])
    || normalizeString(env[`${prefix}_PROVIDER_NAME`])
    || normalizeString(env[`${prefix}_BASE_URL`])
    || normalizeString(env[`${prefix}_DEFAULT_MODEL`])
    || normalizeString(env[`${prefix}_MODEL`])
    || normalizeString(env[`${prefix}_PROVIDER_DEFAULT_MODEL`])
    || (alternativeApiKeyEnv && normalizeString(env[alternativeApiKeyEnv]))
    || (alternativeBaseUrlEnv && normalizeString(env[alternativeBaseUrlEnv]))
    || (alternativeModelEnv && normalizeString(env[alternativeModelEnv])),
  );
  if (!shouldExpose) {
    return null;
  }
  return buildOpenAICompatibleProfile({
    id: normalizeString(env[`${prefix}_PROVIDER_ID`]) ?? preset.id,
    displayName: normalizeString(env[`${prefix}_PROVIDER_NAME`]) ?? preset.displayName,
    cliBin: codexRealBin,
    launchCommand: normalizeString(env.CODEX_APP_LAUNCH_CMD),
    autolaunch: parseBoolean(env.CODEX_APP_AUTOLAUNCH, false),
    apiKeyEnv,
    baseUrl,
    defaultModel,
    providerLabel: normalizeString(env[`${prefix}_PROVIDER_LABEL`]) ?? preset.id,
    upstreamChatCompletionsPath: normalizeString(env[`${prefix}_CHAT_COMPLETIONS_PATH`]) ?? preset.upstreamChatCompletionsPath,
    ownedBy: normalizeString(env[`${prefix}_OWNED_BY`]) ?? preset.ownedBy,
    modelIds: parseCommaList(env[`${prefix}_MODEL_IDS`], preset.modelIds),
    modelCatalogPath: normalizeString(env[`${prefix}_MODEL_CATALOG_PATH`]),
    capabilities: preset.capabilities,
    now,
  });
}

function buildCustomOpenAICompatibleProfile({
  env,
  codexRealBin,
  now,
}: {
  env: NodeJS.ProcessEnv;
  codexRealBin: string;
  now: number;
}): CodexProviderProfile | null {
  const providerId = normalizeString(env.CODEX_COMPAT_PROVIDER_ID);
  const baseUrl = normalizeString(env.CODEX_COMPAT_BASE_URL);
  const defaultModel = normalizeString(env.CODEX_COMPAT_DEFAULT_MODEL) ?? normalizeString(env.CODEX_COMPAT_MODEL);
  const shouldExpose = Boolean(
    providerId
    || baseUrl
    || defaultModel
    || normalizeString(env.CODEX_COMPAT_API_KEY)
    || normalizeString(env.CODEX_COMPAT_API_KEY_ENV)
  );
  if (!shouldExpose) {
    return null;
  }
  const preset = getOpenAICompatibleProviderPreset(env.CODEX_COMPAT_CAPABILITIES);
  const id = providerId ?? 'openai-compatible';
  const apiKeyEnv = normalizeString(env.CODEX_COMPAT_API_KEY_ENV) ?? 'CODEX_COMPAT_API_KEY';
  return buildOpenAICompatibleProfile({
    id,
    displayName: normalizeString(env.CODEX_COMPAT_PROVIDER_NAME) ?? preset.displayName,
    cliBin: codexRealBin,
    launchCommand: normalizeString(env.CODEX_APP_LAUNCH_CMD),
    autolaunch: parseBoolean(env.CODEX_APP_AUTOLAUNCH, false),
    apiKeyEnv,
    baseUrl: baseUrl ?? preset.baseUrl,
    defaultModel: defaultModel ?? preset.defaultModel,
    providerLabel: normalizeString(env.CODEX_COMPAT_PROVIDER_LABEL) ?? id,
    upstreamChatCompletionsPath: normalizeString(env.CODEX_COMPAT_CHAT_COMPLETIONS_PATH) ?? preset.upstreamChatCompletionsPath,
    ownedBy: normalizeString(env.CODEX_COMPAT_OWNED_BY) ?? preset.ownedBy,
    modelIds: parseCommaList(env.CODEX_COMPAT_MODEL_IDS, preset.modelIds),
    modelCatalogPath: normalizeString(env.CODEX_COMPAT_MODEL_CATALOG_PATH),
    capabilities: preset.capabilities,
    now,
  });
}

function buildLegacyOpenAICompatibleProfile({
  env,
  codexRealBin,
  now,
}: {
  env: NodeJS.ProcessEnv;
  codexRealBin: string;
  now: number;
}): CodexProviderProfile | null {
  const modelCatalogPath = normalizeString(env.CODEX_MODEL_CATALOG_PATH);
  const shouldExpose = Boolean(
    normalizeString(env.CODEX_PROVIDER_ID)
    || normalizeString(env.CODEX_PROVIDER_BASE_URL)
    || normalizeString(env.CODEX_PROVIDER_DEFAULT_MODEL)
    || normalizeString(env.CODEX_PROVIDER_API_KEY_ENV)
    || modelCatalogPath
  );
  if (!shouldExpose) {
    return null;
  }
  const preset = getOpenAICompatibleProviderPreset(env.CODEX_PROVIDER_CAPABILITIES);
  const id = normalizeString(env.CODEX_PROVIDER_ID) ?? 'openai-compatible-legacy';
  return buildOpenAICompatibleProfile({
    id,
    displayName: normalizeString(env.CODEX_PROVIDER_NAME) ?? 'OpenAI-Compatible Provider',
    cliBin: codexRealBin,
    launchCommand: normalizeString(env.CODEX_APP_LAUNCH_CMD),
    autolaunch: parseBoolean(env.CODEX_APP_AUTOLAUNCH, false),
    apiKeyEnv: normalizeString(env.CODEX_PROVIDER_API_KEY_ENV) ?? 'CODEX_PROVIDER_API_KEY',
    baseUrl: normalizeString(env.CODEX_PROVIDER_BASE_URL) ?? preset.baseUrl,
    defaultModel: normalizeString(env.CODEX_PROVIDER_DEFAULT_MODEL) ?? preset.defaultModel,
    providerLabel: id,
    upstreamChatCompletionsPath: normalizeString(env.CODEX_PROVIDER_CHAT_COMPLETIONS_PATH) ?? preset.upstreamChatCompletionsPath,
    ownedBy: normalizeString(env.CODEX_PROVIDER_OWNED_BY) ?? preset.ownedBy,
    modelIds: parseCommaList(env.CODEX_PROVIDER_MODEL_IDS, preset.modelIds),
    modelCatalogPath,
    capabilities: preset.capabilities,
    now,
  });
}

function buildOpenAICompatibleProfile({
  id,
  displayName,
  cliBin,
  launchCommand,
  autolaunch,
  apiKeyEnv,
  baseUrl,
  defaultModel,
  providerLabel,
  upstreamChatCompletionsPath,
  ownedBy,
  modelIds,
  modelCatalogPath,
  capabilities,
  now,
}: {
  id: string;
  displayName: string;
  cliBin: string;
  launchCommand: string | null;
  autolaunch: boolean;
  apiKeyEnv: string;
  baseUrl: string;
  defaultModel: string;
  providerLabel: string;
  upstreamChatCompletionsPath: string;
  ownedBy: string;
  modelIds: string[];
  modelCatalogPath: string | null;
  capabilities: OpenAICompatibleProviderCapabilities | null;
  now: number;
}): CodexProviderProfile {
  const fileCatalog = loadModelCatalog(modelCatalogPath);
  return {
    id,
    providerKind: 'openai-compatible',
    displayName,
    config: {
      cliBin,
      launchCommand,
      autolaunch,
      apiKeyEnv,
      baseUrl,
      defaultModel,
      providerLabel,
      backendBaseUrl: baseUrl,
      modelCatalogPath,
      modelCatalog: fileCatalog.length > 0
        ? fileCatalog
        : buildOpenAICompatibleModelCatalog({
          defaultModel,
          modelIds,
          displayName,
          capabilities,
        }),
      modelCatalogMode: 'overlay-only',
      upstreamChatCompletionsPath,
      ownedBy,
      capabilities: mergeOpenAICompatibleProviderCapabilities(capabilities),
    },
    createdAt: now,
    updatedAt: now,
  };
}

function hasEnvValue(env: NodeJS.ProcessEnv, key: string): boolean {
  return Boolean(normalizeString(env[key]));
}

function parseCommaList(value: unknown, fallback: string[]): string[] {
  const parsed = typeof value === 'string'
    ? value.split(',').map((entry) => entry.trim()).filter(Boolean)
    : [];
  return parsed.length > 0 ? parsed : [...fallback];
}

function resolveAgentModelFallbackForBaseUrl(env: NodeJS.ProcessEnv, baseUrl: string): string | null {
  const agentBaseUrl = normalizeString(env.CODEXBRIDGE_AGENT_BASE_URL);
  if (!agentBaseUrl || !agentBaseUrl.toLowerCase().includes(baseUrl.toLowerCase().replace(/^https?:\/\//u, '').split('/')[0] ?? '')) {
    return null;
  }
  return normalizeString(env.CODEXBRIDGE_AGENT_MODEL);
}

function resolveConfiguredCommand(
  command: string | null,
  options: Required<CodexConfigLoadOptions>,
): string | null {
  if (!command) {
    return null;
  }
  return resolveCommand(command, options) ?? command;
}

function resolveExplicitCommandPath(
  command: string,
  {
    platform,
    env,
    cwd,
  }: {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    cwd: string;
  },
): string | null {
  if (!hasPathSeparator(command)) {
    return null;
  }
  const hostCommand = normalizeCommandPathForHost(command, platform);
  const basePath = path.isAbsolute(hostCommand)
    ? hostCommand
    : path.resolve(cwd, hostCommand);
  for (const candidate of buildExplicitCandidates(basePath, platform, env)) {
    if (isCommandFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

function normalizeCommandPathForHost(command: string, platform: NodeJS.Platform): string {
  if (platform !== 'win32' || path.sep !== '/') {
    return command;
  }
  return command.replace(/\\/gu, '/');
}

function buildExplicitCandidates(
  filePath: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string[] {
  const candidates = [filePath];
  if (platform !== 'win32' || path.extname(filePath)) {
    return candidates;
  }
  for (const suffix of resolveWindowsExecutableSuffixes(env)) {
    candidates.push(`${filePath}${suffix}`);
  }
  return unique(candidates);
}

function resolveCommandSuffixes(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  command: string,
): string[] {
  if (platform !== 'win32' || path.extname(command)) {
    return [''];
  }
  return resolveWindowsExecutableSuffixes(env);
}

function resolveWindowsExecutableSuffixes(env: NodeJS.ProcessEnv): string[] {
  const raw = normalizeString(env.PATHEXT);
  const preferred = ['.exe', '.cmd', '.bat', '.com'];
  const allowed = new Set(preferred);
  const suffixes = (raw?.split(';') ?? ['.EXE', '.CMD', '.BAT', '.COM'])
    .map((value) => value.trim().toLowerCase())
    .filter((value) => allowed.has(value));
  return unique([...(preferred), ...(suffixes.length > 0 ? suffixes : preferred)]);
}

function splitPathEntries(value: string | undefined): string[] {
  return String(value ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
}

function resolvePathValue(env: NodeJS.ProcessEnv): string | undefined {
  return env.PATH ?? (env as NodeJS.ProcessEnv & { Path?: string }).Path ?? (env as NodeJS.ProcessEnv & { path?: string }).path;
}

function hasPathSeparator(value: string): boolean {
  return value.includes('/') || value.includes('\\') || /^[a-z]:/iu.test(value);
}

function isCommandFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
