import request from 'supertest';
import { createApp } from '../../src/app.js';

export const ORIGIN = 'http://localhost:5173';

export function testApp(options = {}) {
  return createApp({ clientOrigin: ORIGIN, ...options });
}

/**
 * A cookie-keeping browser-like client: every request carries our Origin header (as a real
 * browser would for state-changing requests) and cookies set by the server are stored and resent.
 */
export function browser(app) {
  const agent = request.agent(app);
  const withOrigin = (req) => req.set('Origin', ORIGIN);
  return {
    agent,
    get: (url) => withOrigin(agent.get(url)),
    post: (url, body) => withOrigin(agent.post(url)).send(body ?? {}),
    patch: (url, body) => withOrigin(agent.patch(url)).send(body ?? {}),
    put: (url, body) => withOrigin(agent.put(url)).send(body ?? {}),
    delete: (url) => withOrigin(agent.delete(url)),
  };
}

export const PASSWORD = 'correct horse 42';

let counter = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${(counter += 1)}@example.test`;

/** Registers a new customer through the API and returns the logged-in client plus the user. */
export async function registeredCustomer(app, overrides = {}) {
  const client = browser(app);
  const body = { name: 'Asha Customer', email: uniqueEmail(), password: PASSWORD, ...overrides };
  const res = await client.post('/api/auth/register', body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, user: res.body.user, email: body.email };
}

/** Parses Set-Cookie headers into { name: { value, attributes } } for assertions. */
export function parseSetCookies(res) {
  const result = {};
  for (const header of res.headers['set-cookie'] ?? []) {
    const [pair, ...attrs] = header.split(';').map((s) => s.trim());
    const [name, ...value] = pair.split('=');
    result[name] = { value: value.join('='), attributes: attrs.map((a) => a.toLowerCase()) };
  }
  return result;
}
