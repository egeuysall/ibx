/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { actionOutput, buildShortcut, withVariables } = require('@joshfarrant/shortcuts-js');
const { ask, text, URLEncode, openURLs, showResult } = require('@joshfarrant/shortcuts-js/actions');

const thoughtInput = actionOutput('Thought Input');
const encodedInput = actionOutput('Encoded Input');
const finalUrl = actionOutput('Final URL');

const actions = [
  ask(
    {
      inputType: 'Text',
      question: 'what should ibx turn into todos?',
      defaultAnswer: '',
    },
    thoughtInput,
  ),
  URLEncode(
    {
      encodeMode: 'Encode',
    },
    encodedInput,
  ),
  text(
    {
      text: withVariables`https://ibx.egeuysal.com/?shortcut=${encodedInput}&source=shortcut`,
    },
    finalUrl,
  ),
  openURLs(),
  showResult({ text: 'sent to ibx' }),
];

const shortcut = buildShortcut(actions, {
  icon: {
    color: 20,
    glyph: 59511,
  },
  showInWidget: true,
});

const outputDir = path.join(__dirname, 'dist');
const outputPath = path.join(outputDir, 'ibx-capture.shortcut');
const publicDir = path.join(__dirname, '..', 'public', 'shortcuts');
const publicPath = path.join(publicDir, 'ibx-capture.shortcut');
const unsignedPublicPath = path.join(publicDir, 'ibx-capture-unsigned.shortcut');

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outputPath, shortcut);

try {
  execFileSync(
    'shortcuts',
    ['sign', '--mode', 'anyone', '--input', outputPath, '--output', publicPath],
    { stdio: 'pipe' },
  );
} catch (error) {
  const reason =
    error && typeof error === 'object' && 'stderr' in error && error.stderr
      ? String(error.stderr).trim()
      : String(error);
  console.error('failed to sign shortcut with `shortcuts sign --mode anyone`');
  console.error(reason);
  process.exit(1);
}

if (fs.existsSync(unsignedPublicPath)) {
  fs.rmSync(unsignedPublicPath);
}

console.log(`generated unsigned ${outputPath}`);
console.log(`generated signed ${publicPath}`);
