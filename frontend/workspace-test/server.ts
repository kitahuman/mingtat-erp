import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd());
const testRoot = path.join(root, 'workspace-test');
const port = Number(process.env.WORKSPACE_TEST_PORT || 4173);

const main = async () => {
  const bundle = await build({
    entryPoints: [path.join(testRoot, 'harness.tsx')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    alias: {
      'next/navigation': path.join(testRoot, 'next-navigation-shim.ts'),
      '@': path.join(root, 'src'),
    },
    define: {
      'process.env.NEXT_PUBLIC_WORKSPACE_TABS_MODULES': JSON.stringify(
        'invoices,quotations',
      ),
    },
    sourcemap: 'inline',
  });

  const html = await readFile(path.join(testRoot, 'index.html'));
  const javascript = bundle.outputFiles[0].contents;

  createServer((request, response) => {
    if (request.url === '/bundle.js') {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
      });
      response.end(javascript);
      return;
    }

    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(html);
  }).listen(port, '0.0.0.0', () => {
    console.log(`Workspace test harness listening on http://0.0.0.0:${port}`);
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
