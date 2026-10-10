import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const files = [
  'demo/index.html', 'demo/demo.css', 'demo/demo.js',
  'src/common-header-footer.js', 'config/site.json', 'README.md',
];
// Copy only the demo's public resources. No dependencies, Git metadata or local files.
for (const file of files) {
  await mkdir(dirname(join(output, file)), { recursive: true });
  await cp(join(root, file), join(output, file));
}
const demo = await readFile(join(root, 'demo/index.html'), 'utf8');
await writeFile(join(output, 'index.html'), demo
  .replace('href="./demo.css"', 'href="./demo/demo.css"')
  .replace('src="./demo.js"', 'src="./demo/demo.js"')
  .replace('config-src="../config/site.json"', 'config-src="./config/site.json"'));
execFileSync('python3', ['-c', `
import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(root / 'common-header-footer-demo.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in sys.argv[2:]:
        archive.write(root / name, name)
`, output, 'index.html', ...files]);
console.log('Static demo: dist/index.html');
console.log('Deployment archive: dist/common-header-footer-demo.zip');
