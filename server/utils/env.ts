import fs from 'fs/promises';
import path from 'path';

export async function updateEnv(updates: Record<string, string | undefined>) {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  try {
    envContent = await fs.readFile(envPath, 'utf-8');
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }

  const lines = envContent.split('\n');
  const envMap: Record<string, string> = {};
  
  for (const line of lines) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      envMap[match[1].trim()] = match[2].trim();
    }
  }

  let hasUpdates = false;
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      if (envMap[key] !== undefined) {
        delete envMap[key];
        hasUpdates = true;
      }
    } else {
      if (envMap[key] !== value) {
        envMap[key] = value;
        hasUpdates = true;
      }
    }
  }

  if (hasUpdates || !envContent) {
    const newContent = Object.entries(envMap)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';
    await fs.writeFile(envPath, newContent, 'utf-8');
  }
}

export async function readEnv(): Promise<Record<string, string>> {
  const envPath = path.join(process.cwd(), '.env');
  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const lines = envContent.split('\n');
    const envMap: Record<string, string> = {};
    for (const line of lines) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        envMap[match[1].trim()] = match[2].trim();
      }
    }
    return envMap;
  } catch (e: any) {
    return {};
  }
}
