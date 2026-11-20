import { markPng } from "./mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return markPng(180, true);
}
