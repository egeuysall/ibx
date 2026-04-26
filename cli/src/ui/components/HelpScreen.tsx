import { Badge } from "@inkjs/ui";
import { Box, Text } from "ink";
import React from "react";

import { APP_TIMEZONE, DEFAULT_BASE_URL, VERSION } from "../../core/constants.js";

type CommandRow = {
  command: string;
  description: string;
};

type CommandSection = {
  title: string;
  rows: CommandRow[];
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

const sections: CommandSection[] = [
  {
    title: "Capture",
    rows: [
      { command: 'ibx add "ship plan"', description: "Generate tasks from text" },
      { command: 'ibx n --input "follow up"', description: "Quick note alias" },
      { command: "ibx", description: "Prompt capture mode" },
    ],
  },
  {
    title: "Tasks",
    rows: [
      { command: "ibx t l --view today", description: "List today's open tasks" },
      { command: "ibx td --json", description: `Done today (${APP_TIMEZONE})` },
      { command: "ibx t x --id <todoId>", description: "Mark task done" },
      { command: "ibx t s --id <todoId> --start 14:00", description: "Edit task fields" },
    ],
  },
  {
    title: "Calendar",
    rows: [
      { command: "ibx cal s", description: "Show feed status" },
      { command: "ibx cal r", description: "Rotate private feed URL" },
    ],
  },
  {
    title: "Account",
    rows: [
      { command: "ibx a l --api-key iak_...", description: "Save API key locally" },
      { command: "ibx a s --json", description: "Check saved auth" },
      { command: "ibx a o", description: "Forget local auth" },
    ],
  },
];

function CommandTable({ section }: { section: CommandSection }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box alignItems="center">
        <Text color={accent} bold>
          {section.title}
        </Text>
        <Text color="#5f5b55"> {"─".repeat(Math.max(8, 28 - section.title.length))}</Text>
      </Box>
      {section.rows.map((row) => (
        <Box key={row.command}>
          <Box width={38}>
            <Text color={accent}>{">"} </Text>
            <Text color={fg}>{row.command}</Text>
          </Box>
          <Text color={muted}>{row.description}</Text>
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
          <Text color={muted}>Auth, AI task runs, JSON output, private calendar rotation.</Text>
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
          <Text color={muted}>install  curl -fsSL {DEFAULT_BASE_URL}/install.sh | bash</Text>
        </Box>
      </Box>
    </Box>
  );
}
