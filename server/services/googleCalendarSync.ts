import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { loadConfig, saveConfig } from './config.js';

interface GoogleTokenState {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  email?: string;
  scope?: string;
}

interface PendingAuth {
  verifier: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  status: 'confirmed' | 'tentative' | 'cancelled';
  location?: string;
  url?: string;
}

const pending = new Map<string, PendingAuth>();
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
];

async function stateFile(): Promise<string> {
  const config = await loadConfig();
  if (!config.workspaceRoot) throw new Error('请先选择 DailyFlow 工作区。');
  return path.join(config.workspaceRoot, '.dailyflow', 'google-calendar.json');
}

async function loadTokens(): Promise<GoogleTokenState | null> {
  try {
    return JSON.parse(await fs.readFile(await stateFile(), 'utf8'));
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function saveTokens(tokens: GoogleTokenState): Promise<void> {
  const file = await stateFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function clientIdFrom(config: Awaited<ReturnType<typeof loadConfig>>): string {
  return process.env.GOOGLE_CALENDAR_CLIENT_ID || config.googleCalendarClientId || '';
}

export async function configureGoogleCalendar(clientId: string): Promise<void> {
  const value = clientId.trim();
  if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value)) {
    throw Object.assign(new Error('请输入有效的 Google Desktop OAuth Client ID。'), { status: 400 });
  }
  const config = await loadConfig();
  await saveConfig({ ...config, googleCalendarClientId: value });
}

export async function getGoogleCalendarStatus() {
  const config = await loadConfig();
  const clientId = clientIdFrom(config);
  const tokens = await loadTokens();
  return {
    configured: Boolean(clientId),
    connected: Boolean(tokens?.refreshToken || (tokens?.accessToken && tokens.expiresAt > Date.now())),
    accountEmail: tokens?.email,
    reason: !clientId ? 'Google Desktop OAuth Client ID is not configured.' : undefined,
  };
}

export async function startGoogleCalendarAuthorization(redirectUri: string): Promise<{ authorizationUrl: string }> {
  const config = await loadConfig();
  const clientId = clientIdFrom(config);
  if (!clientId) throw Object.assign(new Error('请先配置 Google Desktop OAuth Client ID。'), { status: 400 });
  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  pending.set(state, { verifier, redirectUri, clientId, expiresAt: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return { authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
}

export async function finishGoogleCalendarAuthorization(state: string, code: string): Promise<void> {
  const auth = pending.get(state);
  pending.delete(state);
  if (!auth || auth.expiresAt < Date.now()) throw Object.assign(new Error('Google 授权已过期，请重新连接。'), { status: 400 });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: auth.clientId,
      code,
      code_verifier: auth.verifier,
      grant_type: 'authorization_code',
      redirect_uri: auth.redirectUri,
    }),
  });
  const data: any = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Google token exchange failed.');
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const user: any = userResponse.ok ? await userResponse.json() : {};
  const previous = await loadTokens();
  await saveTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previous?.refreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    email: user.email,
    scope: data.scope,
  });
}

async function accessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw Object.assign(new Error('请先连接 Google Calendar。'), { status: 401 });
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
  if (!tokens.refreshToken) throw Object.assign(new Error('Google 授权已过期，请重新连接。'), { status: 401 });
  const config = await loadConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientIdFrom(config),
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data: any = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || 'Google token refresh failed.');
  const next = { ...tokens, accessToken: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  await saveTokens(next);
  return next.accessToken;
}

export async function getGoogleCalendarEvents(start: string, end: string): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: `${start}T00:00:00+08:00`,
    timeMax: `${end}T23:59:59+08:00`,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Failed to load Google Calendar.');
  return (data.items || []).map((event: any) => ({
    id: event.id,
    title: event.summary || 'Untitled event',
    description: event.description,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    allDay: Boolean(event.start?.date),
    status: event.status === 'tentative' ? 'tentative' : event.status === 'cancelled' ? 'cancelled' : 'confirmed',
    location: event.location,
    url: event.htmlLink,
  }));
}
