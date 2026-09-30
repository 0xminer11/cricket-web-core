import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd();
const allowed = {
  'game-core': [],
  'shared-types': [],
  config: ['game-core'],
  'match-engine': ['game-core'],
  logger: [],
  database: ['config', 'game-core', 'logger'],
  ui: [],
  testing: ['game-core'],
  'server-kit': ['config', 'logger', 'shared-types'],
  web: ['config', 'ui', 'shared-types', 'game-core'],
  admin: ['config', 'ui', 'shared-types', 'game-core'],
  api: [
    'server-kit',
    'config',
    'game-core',
    'database',
    'logger',
    'shared-types',
  ],
  'game-server': [
    'server-kit',
    'config',
    'game-core',
    'match-engine',
    'logger',
    'shared-types',
  ],
};
const errors = [];
const graph = new Map();
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.next', '.turbo'].includes(entry.name))
      continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(file)));
    else if (/\.(ts|tsx|mjs)$/.test(file)) out.push(file);
  }
  return out;
}
for (const base of ['apps', 'packages'])
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.resolve(base, entry.name);
    const manifest = JSON.parse(
      await readFile(path.join(dir, 'package.json'), 'utf8'),
    );
    const deps = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    };
    const internal = Object.keys(deps)
      .filter((v) => v.startsWith('@the-cricketer/'))
      .map((v) => v.split('/')[1]);
    graph.set(entry.name, internal);
    for (const dep of internal)
      if (!allowed[entry.name]?.includes(dep))
        errors.push(`${entry.name} cannot depend on ${dep}`);
    for (const file of await walk(path.join(dir, 'src'))) {
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node) {
        let specifier;
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        )
          specifier = node.moduleSpecifier.text;
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          specifier = node.arguments[0].text;
        if (specifier) {
          if (specifier.startsWith('.')) {
            const target = path.resolve(path.dirname(file), specifier);
            if (!target.startsWith(dir + path.sep))
              errors.push(
                `${file}: cross-package relative import ${specifier}`,
              );
          } else if (!specifier.startsWith('node:')) {
            const dependency = specifier.startsWith('@')
              ? specifier.split('/').slice(0, 2).join('/')
              : specifier.split('/')[0];
            if (!(dependency in deps))
              errors.push(`${file}: undeclared dependency ${dependency}`);
            if (
              dependency.startsWith('@the-cricketer/') &&
              specifier !== dependency &&
              !(
                dependency === '@the-cricketer/ui' &&
                specifier.endsWith('/tokens.css')
              )
            )
              errors.push(`${file}: internal deep import ${specifier}`);
          }
          if (
            ['game-core', 'match-engine'].includes(entry.name) &&
            !specifier.startsWith('.') &&
            specifier !== '@the-cricketer/game-core'
          )
            errors.push(
              `${file}: domain package must remain platform-independent`,
            );
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
const visited = new Set();
const active = new Set();
function visit(name) {
  if (active.has(name)) {
    errors.push(`Circular dependency: ${name}`);
    return;
  }
  if (visited.has(name)) return;
  active.add(name);
  for (const dep of graph.get(name) ?? []) visit(dep);
  active.delete(name);
  visited.add(name);
}
for (const name of graph.keys()) visit(name);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Package boundaries and dependency graph valid (${path.basename(root)}).`,
  );
