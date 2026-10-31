import { Badge } from "@inkjs/ui";
import { Box, Text } from "ink";
import React from "react";

import { CLI_COMMANDS } from "../../command-manifest.js";
import { DEFAULT_BASE_URL, VERSION } from "../../core/constants.js";

type CommandSection = {
  title: string;
  description: string;
  examples: string[];
};

const accent = "#ff8a5c";
const fg = "#d7d3c8";
const muted = "#8a8984";
const border = "#d26b4c";

const logo = [
  " ██╗██████╗ ██╗  ██╗",
  " ██║██╔══██╗╚██╗██╔╝",
  " ██║██████╔╝ ╚███╔╝ ",
  " ██║██╔══██╗ ██╔██╗ ",
  " ██║██████╔╝██╔╝ ██╗",
  " ╚═╝╚═════╝ ╚═╝  ╚═╝",
];

const sections: CommandSection[] = Object.entries(CLI_COMMANDS).map(
  ([title, command]) => ({
    title,
    description: command.description,
    examples: command.examples,
  }),
);

function CommandTable({ section }: { section: CommandSection }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box alignItems="center">
        <Text color={accent} bold>
          {section.title}
        </Text>
      </Box>
      <Text color={muted}>{section.description}</Text>
      {section.examples.map((command) => (
        <Box key={command}>
          <Box width={38}>
            <Text color={accent}>{">"} </Text>
            <Text color={fg}>{command}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

export default function HelpScreen() {
  return (
    <Box flexDirection="column" paddingTop={1} paddingLeft={1}>
      <Box
        borderStyle="round"
        borderColor={border}
        paddingX={2}
        paddingY={1}
        width={104}
        marginBottom={1}
      >
        <Box marginRight={4} flexDirection="column" width={26}>
          {logo.map((line) => (
            <Text key={line} color="#b9b8b2" bold>
              {line}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" paddingTop={1}>
          <Box alignItems="center" marginBottom={1}>
            <Badge color={accent}>CLI</Badge>
            <Text color={muted}> v{VERSION}</Text>
          </Box>
          <Text color={accent}>Task capture, schedule, and calendar feed from terminal</Text>
          <Text color={muted}>Command list is generated from the router manifest.</Text>
        </Box>
      </Box>

      <Box flexDirection="column" width={104}>
        {sections.map((section) => (
          <CommandTable key={section.title} section={section} />
        ))}
      </Box>

      <Box borderStyle="single" borderColor="#6f625d" paddingX={1} paddingY={0} width={104}>
        <Box flexDirection="column">
          <Text color={fg}>try  ibx t l --view today --json</Text>
          <Text color={muted}>help  ibx --help</Text>
          <Text color={muted}>update ibx self-update</Text>
          <Text color={muted}>install  curl -fsSL {DEFAULT_BASE_URL}/install.sh | bash</Text>
        </Box>
      </Box>
    </Box>
  );
}
