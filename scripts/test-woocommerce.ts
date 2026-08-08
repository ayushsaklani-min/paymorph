import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const php = resolvePhp();
const plugin = 'apps/woocommerce-gateway/paymorph-woocommerce.php';
const smoke = 'apps/woocommerce-gateway/tests/plugin-smoke.php';

execFileSync(php, ['-l', plugin], { cwd: process.cwd(), stdio: 'inherit' });
execFileSync(php, [smoke], { cwd: process.cwd(), stdio: 'inherit' });

function resolvePhp(): string {
  if (process.env.PHP_BINARY) return process.env.PHP_BINARY;
  const command = process.platform === 'win32' ? 'where.exe' : 'which';
  const located = spawnSync(command, ['php'], { encoding: 'utf8', windowsHide: true });
  const first = located.status === 0 ? located.stdout.split(/\r?\n/).find(Boolean) : undefined;
  if (first) return first;

  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const packages = join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
    try {
      for (const entry of readdirSync(packages).sort().reverse()) {
        if (!entry.startsWith('PHP.PHP.')) continue;
        const candidate = join(packages, entry, 'php.exe');
        const check = spawnSync(candidate, ['-v'], { stdio: 'ignore', windowsHide: true });
        if (check.status === 0) return candidate;
      }
    } catch {
      // The explicit error below explains how to provide a nonstandard path.
    }
  }

  throw new Error('PHP was not found. Install PHP 8.1+ or set PHP_BINARY.');
}
