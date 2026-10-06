// Loopback settings for the support widget.
//
// Read on every request from LOOPBACK_CONFIG_FILE (JSON), so Loopback's demo-setup can
// write the file after Ledgerly has started. Env vars with the same meaning override the
// file for standalone use. Missing or invalid settings mean "no widget".

import { readFile } from 'node:fs/promises';

export interface LoopbackConfig {
  apiPublicUrl: string;
  widgetConnectionId: string;
  identitySecret: string;
  helpCenterUrl?: string;
}

const ENV_KEYS = {
  apiPublicUrl: 'LOOPBACK_API_PUBLIC_URL',
  widgetConnectionId: 'LOOPBACK_WIDGET_CONNECTION_ID',
  identitySecret: 'LOOPBACK_IDENTITY_SECRET',
  helpCenterUrl: 'LOOPBACK_HELP_CENTER_URL',
} as const;

type Raw = Partial<Record<keyof LoopbackConfig, unknown>>;

async function readConfigFile(path: string | undefined): Promise<Raw> {
  if (!path) return {};
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Raw) : {};
  } catch {
    return {};
  }
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export async function loadLoopbackConfig(
  file: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LoopbackConfig | null> {
  const merged: Raw = await readConfigFile(file);
  for (const [key, envName] of Object.entries(ENV_KEYS) as [keyof LoopbackConfig, string][]) {
    const value = env[envName];
    if (nonEmpty(value)) merged[key] = value;
  }

  const { apiPublicUrl, widgetConnectionId, identitySecret, helpCenterUrl } = merged;
  if (!isHttpUrl(apiPublicUrl) || !nonEmpty(widgetConnectionId) || !nonEmpty(identitySecret)) {
    return null;
  }
  return {
    apiPublicUrl: apiPublicUrl.replace(/\/+$/, ''),
    widgetConnectionId,
    identitySecret,
    ...(isHttpUrl(helpCenterUrl) ? { helpCenterUrl } : {}),
  };
}
