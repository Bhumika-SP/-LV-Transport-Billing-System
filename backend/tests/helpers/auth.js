import request from 'supertest';
import { TEST_PASSWORD, TEST_USERS } from './db.js';

/** A cookie-keeping agent that sends the CSRF header on every request. */
export function newAgent(app) {
  return request.agent(app).set('X-Requested-With', 'XMLHttpRequest');
}

/** Log in as one of TEST_USERS ('admin' | 'biller' | 'auditor') and return the agent. */
export async function loginAs(app, who) {
  const agent = newAgent(app);
  const res = await agent
    .post('/api/auth/login')
    .send({ email: TEST_USERS[who].email, password: TEST_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Login as ${who} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

/** Log in as all three roles. */
export async function loginAll(app) {
  const [admin, biller, auditor] = await Promise.all([
    loginAs(app, 'admin'),
    loginAs(app, 'biller'),
    loginAs(app, 'auditor'),
  ]);
  return { admin, biller, auditor };
}
