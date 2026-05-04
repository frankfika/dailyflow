import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import type { Config } from '../types/task.js';

const CONFIG_FILE = path.join(os.homedir(), '.dailyflow', 'config.json');

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Config = {
  workspaceRoot: path.join(os.homedir(), 'Documents', 'Notes'),
  dailyPathTemplate: 'Daily/{year}/{month}/{date}.md',
  rolloverTrigger: 'manual',
  rolloverSkipTags: ['no-rollover']
};

/**
 * 加载配置
 */
export async function loadConfig(): Promise<Config> {
  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content);
    return { ...DEFAULT_CONFIG, ...config };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

/**
 * 保存配置
 */
export async function saveConfig(config: Config): Promise<void> {
  const dir = path.dirname(CONFIG_FILE);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
