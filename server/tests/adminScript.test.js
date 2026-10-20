import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { connectTestDB, clearTestDB, disconnectTestDB } from './helpers/db.js';
import { User } from '../src/models/index.js';

const serverDir = fileURLToPath(new URL('..', import.meta.url));

// Runs the real script against the (guarded) test database: NODE_ENV=test is inherited from setup-env.js.
function runScript(env) {
  return spawnSync(process.execPath, ['scripts/create-admin.js'], { cwd: serverDir, env: { ...process.env, ...env }, encoding: 'utf8', timeout: 30_000 });
}

describe('create-admin script', () => {
  before(async () => {
    await connectTestDB();
    await clearTestDB();
  });
  after(disconnectTestDB);

  it('creates an administrator with a hashed password and never prints the password', async () => {
    const result = runScript({ ADMIN_EMAIL: 'Boss@Example.test', ADMIN_PASSWORD: 'Sup3r secret admin', ADMIN_NAME: 'Boss' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Created administrator boss@example\.test/);
    assert.doesNotMatch(result.stdout + result.stderr, /Sup3r secret admin/);

    const admin = await User.findOne({ email: 'boss@example.test' }).select('+passwordHash');
    assert.equal(admin.role, 'admin');
    assert.ok(await bcrypt.compare('Sup3r secret admin', admin.passwordHash));
  });

  it('promotes an existing customer without changing the password, and revokes sessions', async () => {
    const customer = await User.create({ name: 'C', email: 'promote@example.test', passwordHash: 'unchanged-hash' });
    const result = runScript({ ADMIN_EMAIL: 'promote@example.test', ADMIN_PASSWORD: '' });
    assert.equal(result.status, 0, result.stderr);
    const updated = await User.findById(customer._id).select('+passwordHash');
    assert.equal(updated.role, 'admin');
    assert.equal(updated.passwordHash, 'unchanged-hash');
    assert.equal(updated.tokenVersion, 1);
  });

  it('refuses weak passwords and invalid emails', () => {
    assert.equal(runScript({ ADMIN_EMAIL: 'new@example.test', ADMIN_PASSWORD: 'weak' }).status, 1);
    assert.equal(runScript({ ADMIN_EMAIL: 'not-an-email', ADMIN_PASSWORD: 'Str0ng password' }).status, 1);
  });
});
