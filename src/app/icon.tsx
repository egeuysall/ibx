import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
            fontSize: 360,
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
