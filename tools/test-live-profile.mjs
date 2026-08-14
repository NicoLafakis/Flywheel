import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Parse .env.local
const envContent = readFileSync(resolve('.env.local'), 'utf8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)?\s*$/);
  if (m && !process.env[m[1]]) {
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}
process.env.FW_TICKET_SECRET = process.env.FW_TICKET_SECRET || 'dev-ticket-secret-32-chars-long!!';

async function testLiveAuth() {
  const { default: registerHandler } = await import('../api/auth/register.mjs');
  const { default: loginHandler } = await import('../api/auth/login.mjs');

  const testName = 'Pilot' + Math.floor(Math.random() * 8999 + 1000);
  const testPassword = 'Password123!';
  const testDevice = 'live-test-device-key-998877665544';

  console.log('1. Testing registration with name:', testName);
  
  function makeReq(payload) {
    return {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify(payload));
      }
    };
  }

  function makeRes() {
    let status = 200;
    const headers = {};
    let data = '';
    return {
      status(s) { status = s; return this; },
      setHeader(k, v) { headers[k] = v; return this; },
      end(payload) { data = payload; },
      getPayload() { return { status, headers, body: JSON.parse(data) }; }
    };
  }

  // Register
  const regReq = makeReq({ name: testName, password: testPassword, device_key: testDevice });
  const regRes = makeRes();
  await registerHandler(regReq, regRes);
  const regOut = regRes.getPayload();
  console.log('Register status:', regOut.status);
  console.log('Register body:', JSON.stringify(regOut.body, null, 2));

  if (!regOut.body.ok) throw new Error('Registration failed: ' + JSON.stringify(regOut.body));

  // Login on a second device
  console.log('\n2. Testing login on a second device with same name and password...');
  const loginReq = makeReq({ name: testName, password: testPassword, device_key: 'second-device-key-112233445566' });
  const loginRes = makeRes();
  await loginHandler(loginReq, loginRes);
  const loginOut = loginRes.getPayload();
  console.log('Login status:', loginOut.status);
  console.log('Login body:', JSON.stringify(loginOut.body, null, 2));

  if (!loginOut.body.ok) throw new Error('Login failed: ' + JSON.stringify(loginOut.body));

  console.log('\n✓ Profile creation and live login test ALL PASS!');
}

testLiveAuth().catch(err => {
  console.error('Test Error:', err);
  process.exit(1);
});
