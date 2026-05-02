#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'apps/universal-app/src');

const ignoredPathFragments = [
  `${path.sep}services${path.sep}analytics${path.sep}`,
];

const allowedPropertyNames = new Set([
  'agegroup',
  'charactercount',
  'childrencount',
  'hascharacters',
  'haschildprofile',
  'haschildren',
  'hasgoal',
  'hasimagestyle',
  'hasphotos',
  'hasusernotes',
  'mode',
  'photocount',
  'planslug',
  'preferredlocale',
  'requestid',
  'scenariocardid',
  'storyid',
  'visibility',
  'voiceid',
  'wizardtype',
]);

const sensitiveExactNames = new Set([
  'audiouri',
  'audiourl',
  'childname',
  'childnames',
  'childprofile',
  'displayname',
  'email',
  'errormessage',
  'imageuri',
  'imageurl',
  'message',
  'narration',
  'photo',
  'photos',
  'photouri',
  'photourl',
  'prompt',
  'rawprompt',
  'storytext',
  'storytitle',
  'text',
  'transcript',
  'uri',
  'url',
]);

const sensitiveNamePattern = /(email|displayname|childname|storytitle|storytext|rawprompt|prompt|errormessage|message|transcript|narration|photouri|photourl|imageuri|imageurl|audiouri|audiourl)$/i;

function normalizePropertyName(name) {
  return name.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSensitivePropertyName(name) {
  const normalized = normalizePropertyName(name);
  if (allowedPropertyNames.has(normalized)) return false;
  return sensitiveExactNames.has(normalized) || sensitiveNamePattern.test(normalized);
}

function listSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function getPropertyNameText(nameNode) {
  if (!nameNode) return null;
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) {
    return nameNode.text;
  }
  return null;
}

function isAnalyticsCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  return (
    ts.isPropertyAccessExpression(expression) &&
    (expression.name.text === 'capture' || expression.name.text === 'identify')
  );
}

function checkObjectLiteral(filePath, sourceFile, objectLiteral, methodName, findings) {
  for (const property of objectLiteral.properties) {
    if (ts.isPropertyAssignment(property)) {
      const key = getPropertyNameText(property.name);
      if (key && isSensitivePropertyName(key)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(property.name.getStart(sourceFile));
        findings.push({
          filePath,
          line: line + 1,
          column: character + 1,
          methodName,
          propertyName: key,
          reason: 'sensitive analytics property name',
        });
      }
      continue;
    }

    if (ts.isShorthandPropertyAssignment(property)) {
      const key = property.name.text;
      if (isSensitivePropertyName(key)) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(property.name.getStart(sourceFile));
        findings.push({
          filePath,
          line: line + 1,
          column: character + 1,
          methodName,
          propertyName: key,
          reason: 'sensitive shorthand analytics property',
        });
      }
    }
  }
}

function checkFile(filePath, findings) {
  if (ignoredPathFragments.some((fragment) => filePath.includes(fragment))) {
    return;
  }

  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  function visit(node) {
    if (isAnalyticsCall(node)) {
      const methodName = node.expression.name.text;
      const propertiesArg = node.arguments[1];
      if (propertiesArg && ts.isObjectLiteralExpression(propertiesArg)) {
        checkObjectLiteral(filePath, sourceFile, propertiesArg, methodName, findings);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const findings = [];
for (const file of listSourceFiles(sourceRoot)) {
  checkFile(file, findings);
}

if (findings.length > 0) {
  console.error('FAIL analytics payload audit found risky properties:');
  for (const finding of findings) {
    const relative = path.relative(projectRoot, finding.filePath);
    console.error(`- ${relative}:${finding.line}:${finding.column} ${finding.methodName} property '${finding.propertyName}' (${finding.reason})`);
  }
  process.exit(1);
}

console.log('PASS analytics payload audit found no risky capture/identify properties');
