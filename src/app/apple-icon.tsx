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
        }}
      >
        <svg
          viewBox="0 0 100 100"
          width="74%"
          height="74%"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline
            points="34,34 66,50 34,66"
            stroke="#ffffff"
            strokeWidth="8.5"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    },
  );
}
