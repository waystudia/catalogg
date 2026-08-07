import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { log } from './log.mjs';

const positions = {
  client: { x: 0, y: 0 }, restaurant: { x: 430, y: 0 }, driver: { x: 860, y: 0 }
};

const internalHost = (config, url) => {
  try {
    const host = new URL(url).host;
    return host === new URL(config.baseUrl).host || host === new URL(config.supabaseUrl).host;
  } catch { return false; }
};

export const launchRole = async (config, role) => {
  const position = positions[role];
  const browser = await chromium.launch({
    headless: false,
    args: [
      `--window-position=${position.x},${position.y}`,
      '--window-size=410,900',
      '--force-device-scale-factor=0.9',
      '--disable-features=Translate'
    ]
  });
  const videoDir = join(config.artifactDir, 'video', role);
  if (config.recordVideo) await mkdir(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    geolocation: { latitude: 43.32, longitude: 45.7, accuracy: 10 },
    permissions: ['geolocation'],
    ...(config.recordVideo ? { recordVideo: { dir: videoDir, size: { width: 390, height: 844 } } } : {})
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    if (internalHost(config, request.url()) && request.failure()?.errorText !== 'net::ERR_ABORTED') {
      errors.push(`requestfailed ${request.method()} ${request.url()}: ${request.failure()?.errorText}`);
    }
  });
  page.on('request', (request) => {
    const match = request.url().match(/\/rpc\/(create_[a-z0-9_]+)$/i);
    if (match) log(role.toUpperCase(), `Order RPC: ${match[1]}`);
  });
  page.on('response', (response) => {
    if (internalHost(config, response.url()) && response.status() >= 400) {
      errors.push(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  log(role.toUpperCase(), 'Independent Chromium context opened');
  return { role, browser, context, page, errors, traceStopped: false };
};

export const closeRoles = async (roles, config, failed = false) => {
  await mkdir(join(config.artifactDir, 'traces'), { recursive: true });
  for (const role of roles) {
    if (!role.traceStopped) {
      await role.context.tracing.stop(failed ? { path: join(config.artifactDir, 'traces', `${role.role}.zip`) } : undefined).catch(() => undefined);
      role.traceStopped = true;
    }
    await role.browser.close().catch(() => undefined);
  }
};

export const screenshot = async (role, config, name) => {
  await mkdir(config.artifactDir, { recursive: true });
  await role.page.screenshot({ path: join(config.artifactDir, name), fullPage: true });
};
