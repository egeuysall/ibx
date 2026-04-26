import { defaultTheme, extendTheme, type Theme } from "@inkjs/ui";
import type { TextProps } from "ink";

const accent = "#ff8a5c";
const muted = "#8a8984";

export const ibxTheme: Theme = extendTheme(defaultTheme, {
  components: {
    Badge: {
      styles: {
        container: (): TextProps => ({
          backgroundColor: accent,
          color: "#242421",
          bold: true,
        }),
      },
    },
    StatusMessage: {
      styles: {
        icon: ({ variant }: { variant: string }): TextProps => ({
          color:
            variant === "success"
              ? "#8bd17c"
              : variant === "warning"
                ? accent
                : variant === "error"
                  ? "#ff5f57"
                  : "#79b8ff",
        }),
        text: (): TextProps => ({
          color: muted,
        }),
      },
    },
    UnorderedList: {
      config: () => ({
        marker: ">",
      }),
    },
  },
});

