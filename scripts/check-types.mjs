import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const violations = [];
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { inspect(filename); continue; }
    if (!/\.tsx?$/.test(filename)) continue;
    const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(`${filename}:${line + 1}: explicit any is forbidden`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
inspect('server/src');
inspect('web/src');
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
else console.log('Type policy passed: no explicit any.');
