import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          color: "#ffffff",
          fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 118,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        &gt;
      </div>
    ),
    {
      ...size,
    },
  );
}
