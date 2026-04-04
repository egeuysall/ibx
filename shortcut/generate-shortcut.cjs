/* eslint-disable @typescript-eslint/no-require-imports */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  actionOutput,
  buildShortcut,
  withVariables,
} = require("@joshfarrant/shortcuts-js");
const {
  URL,
  ask,
  conditional,
  exitShortcut,
  getContentsOfURL,
  text,
} = require("@joshfarrant/shortcuts-js/actions");

const thoughtInput = actionOutput("Thought Input");
const apiKeyInput = actionOutput("API Key (Edit Once)");
const API_KEY_PLACEHOLDER = "iak_replace_me";

function buildApiSubmitAction(textInput) {
  const action = getContentsOfURL({
    method: "POST",
    requestBodyType: "JSON",
    headers: {
      Authorization: "Bearer iak_placeholder",
    },
    requestBody: {
      text: "placeholder",
    },
  });

  const headers =
    action?.WFWorkflowActionParameters?.WFHTTPHeaders?.Value
      ?.WFDictionaryFieldValueItems;
  const bodyFields =
    action?.WFWorkflowActionParameters?.WFJSONValues?.Value
      ?.WFDictionaryFieldValueItems;
  if (!Array.isArray(headers) || !Array.isArray(bodyFields)) {
    throw new Error("failed to build shortcut API action");
  }

  const authorizationHeader = headers.find(
    (item) => item?.WFKey?.Value?.string === "Authorization",
  );
  const textField = bodyFields.find(
    (item) => item?.WFKey?.Value?.string === "text",
  );
  if (!authorizationHeader || !textField) {
    throw new Error("failed to configure shortcut API action");
  }

  authorizationHeader.WFValue = withVariables`Bearer ${apiKeyInput}`;
  textField.WFValue = withVariables`${textInput}`;
  return action;
}

function sharedApiKeyActions() {
  return [
    text(
      {
        text: API_KEY_PLACEHOLDER,
      },
      apiKeyInput,
    ),
    conditional({
      input: "=",
      value: API_KEY_PLACEHOLDER,
      ifTrue: [exitShortcut()],
    }),
    conditional({
      input: "Contains",
      value: "iak_",
      ifFalse: [exitShortcut()],
    }),
  ];
}

const captureActions = [
  ask(
    {
      inputType: "Text",
      question: "what's in your mind?",
      defaultAnswer: "",
    },
    thoughtInput,
  ),
  conditional({
    input: "=",
    value: "",
    ifTrue: [exitShortcut()],
  }),
  ...sharedApiKeyActions(),
  URL({
    url: "https://ibx.egeuysal.com/api/todos/generate",
  }),
  buildApiSubmitAction(thoughtInput),
];

const captureShortcut = buildShortcut(captureActions, {
  icon: {
    color: 20,
    glyph: 59511,
  },
  showInWidget: true,
});

const outputDir = path.join(__dirname, "dist");
const captureOutputPath = path.join(outputDir, "ibx-capture.shortcut");
const publicDir = path.join(__dirname, "..", "public", "shortcuts");
const capturePublicPath = path.join(publicDir, "ibx-capture.shortcut");
const unsignedPublicPath = path.join(
  publicDir,
  "ibx-capture-unsigned.shortcut",
);
const legacySyncOutputPath = path.join(outputDir, "ibx-sync-queue.shortcut");
const legacySyncPublicPath = path.join(publicDir, "ibx-sync-queue.shortcut");

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(captureOutputPath, captureShortcut);

try {
  execFileSync(
    "shortcuts",
    [
      "sign",
      "--mode",
      "anyone",
      "--input",
      captureOutputPath,
      "--output",
      capturePublicPath,
    ],
    { stdio: "pipe" },
  );
} catch (error) {
  const reason =
    error && typeof error === "object" && "stderr" in error && error.stderr
      ? String(error.stderr).trim()
      : String(error);
  console.error("failed to sign shortcut with `shortcuts sign --mode anyone`");
  console.error(reason);
  process.exit(1);
}

if (fs.existsSync(unsignedPublicPath)) {
  fs.rmSync(unsignedPublicPath);
}
if (fs.existsSync(legacySyncOutputPath)) {
  fs.rmSync(legacySyncOutputPath);
}
if (fs.existsSync(legacySyncPublicPath)) {
  fs.rmSync(legacySyncPublicPath);
}

console.log(`generated unsigned ${captureOutputPath}`);
console.log(`generated signed ${capturePublicPath}`);
