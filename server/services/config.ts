import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Config } from '../types/task.js';
import { readEnv, updateEnv } from '../utils/env.js';

const CONFIG_FILE = path.join(os.homedir(), '.dailyflow', 'config.json');

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Config = {
  workspaceRoot: path.join(os.homedir(), 'Desktop', 'DailyFlow'),
  dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
  rolloverTrigger: 'manual',
  rolloverSkipTags: ['no-rollover'],
  activeContext: 'work'
};

/**
 * 加载配置
 */
export async function loadConfig(): Promise<Config> {
  let config: Partial<Config> = {};
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    config = JSON.parse(content);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  const env = await readEnv();
  
  return { 
    ...DEFAULT_CONFIG, 
    ...config,
    githubRepo: env.GITHUB_REPO || config.githubRepo,
    githubToken: env.GITHUB_TOKEN || config.githubToken,
    aiProvider: (env.AI_PROVIDER as any) || config.aiProvider,
    aiApiKey: env.AI_API_KEY || config.aiApiKey,
    aiModel: env.AI_MODEL || config.aiModel,
    aiBaseUrl: env.AI_BASE_URL || config.aiBaseUrl,
    aiFormat: (env.AI_FORMAT as any) || config.aiFormat,
  };
}

/**
 * 保存配置
 */
export async function saveConfig(config: Config): Promise<void> {
  const dir = path.dirname(CONFIG_FILE);
  await fs.mkdir(dir, { recursive: true });
  
  // Extract sensitive or env-based config
  const envUpdates = {
    GITHUB_REPO: config.githubRepo,
    GITHUB_TOKEN: config.githubToken,
    AI_PROVIDER: config.aiProvider,
    AI_API_KEY: config.aiApiKey,
    AI_MODEL: config.aiModel,
    AI_BASE_URL: config.aiBaseUrl,
    AI_FORMAT: config.aiFormat,
  };
  await updateEnv(envUpdates);

  // Filter out env config from json to keep json clean
  const jsonConfig = { ...config };
  delete jsonConfig.githubRepo;
  delete jsonConfig.githubToken;
  delete jsonConfig.aiProvider;
  delete jsonConfig.aiApiKey;
  delete jsonConfig.aiModel;
  delete jsonConfig.aiBaseUrl;
  delete jsonConfig.aiFormat;

  await fs.writeFile(CONFIG_FILE, JSON.stringify(jsonConfig, null, 2), 'utf-8');
}
