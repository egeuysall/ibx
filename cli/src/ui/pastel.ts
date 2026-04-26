import { ThemeProvider } from "@inkjs/ui";
import { renderToString } from "ink";
import React from "react";

import HelpScreen from "./components/HelpScreen.js";
import { ibxTheme } from "./theme.js";

const ThemedHelp = ThemeProvider as React.ComponentType<{
  theme: typeof ibxTheme;
  children?: React.ReactNode;
}>;

function renderHelpUiDirect() {
  const output = renderToString(
    React.createElement(ThemedHelp, { theme: ibxTheme }, React.createElement(HelpScreen)),
    {
      columns: process.stdout.columns || 100,
    },
  );

  process.stdout.write(`${output}\n`);
}

export async function renderHelpUi() {
  renderHelpUiDirect();
}
