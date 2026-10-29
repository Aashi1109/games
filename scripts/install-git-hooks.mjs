import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const hooks = execFileSync(
  'git',
  ['rev-parse', '--path-format=absolute', '--git-path', 'hooks'],
  { cwd: root, encoding: 'utf8' },
).trim();
const target = join(hooks, 'pre-commit');
const source = readFileSync(
  new URL('../.githooks/pre-commit', import.meta.url),
);

if (existsSync(target) && !readFileSync(target).equals(source)) {
  throw new Error(
    `An existing pre-commit hook must be integrated first: ${target}`,
  );
}
mkdirSync(hooks, { recursive: true });
writeFileSync(target, source);
chmodSync(target, 0o755);
