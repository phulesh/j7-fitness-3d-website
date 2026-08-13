import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "64px",
          height: "64px",
          background: "#1C1410",
          color: "#E0C56E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 36,
          fontFamily: "Georgia",
        }}
      >
        F
      </div>
    ),
    size
  );
}
