import { ThemeProvider } from "@inkjs/ui";
import type { AppProps } from "pastel";
import React from "react";

import { ibxTheme } from "../theme.js";

export default function App({ Component, commandProps }: AppProps) {
  return (
    <ThemeProvider theme={ibxTheme}>
      <Component {...commandProps} />
    </ThemeProvider>
  );
}

