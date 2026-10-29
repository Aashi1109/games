import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

async function run(script, environment = {}) {
  const child = spawn('pnpm', ['run', script], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...environment },
  });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${script} failed (${signal ?? code}).`);
}

try {
  await run('test');
  await run('build');
  await run('test:launch');
  await run('test:lifecycle');

  process.env.NODE_ENV = 'production';
  const { createCollectionServer } = await import('../src/server.ts');
  const server = await createCollectionServer({ port: 0 });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    await run('test:e2e', {
      BASE_URL: `http://127.0.0.1:${address.port}`,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
