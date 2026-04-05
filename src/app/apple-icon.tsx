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
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "block",
            color: "#ffffff",
            fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 140,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          &gt;
        </span>
      </div>
    ),
    {
      ...size,
    },
  );
}
