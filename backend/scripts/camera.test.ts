/* Which camera a video call starts with. Run with: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCamera, nextCamera } from "../app/calls/camera";

const mac = [{ deviceId: "iphone", label: "Aadi Camera" }, { deviceId: "builtin", label: "FaceTime HD Camera" }];

test("a Mac with an iPhone as Continuity Camera starts on its own FaceTime camera", () => {
  assert.equal(chooseCamera(mac, null, false), "builtin", "the iPhone is named after the phone, not 'iPhone', and is still passed over");
});

test("a camera the person picked earlier wins, if it is still there", () => {
  assert.equal(chooseCamera(mac, "iphone", false), "iphone");
  assert.equal(chooseCamera(mac, "unplugged-webcam", false), "builtin");
});

test("Windows and Linux built-in cameras are found too, and a USB webcam beats a phone", () => {
  assert.equal(chooseCamera([{ deviceId: "p", label: "DroidCam Source 3" }, { deviceId: "w", label: "Integrated Camera (04f2:b6dd)" }], null, false), "w");
  assert.equal(chooseCamera([{ deviceId: "p", label: "iPhone Camera" }, { deviceId: "u", label: "Logitech BRIO" }], null, false), "u");
});

test("phones, single cameras and unreadable names are left to the browser", () => {
  assert.equal(chooseCamera(mac, null, true), undefined, "a phone starts on its front camera as before");
  assert.equal(chooseCamera([mac[1]], null, false), undefined);
  assert.equal(chooseCamera([{ deviceId: "a", label: "" }, { deviceId: "b", label: "" }], null, false), undefined, "before permission, names are empty");
});

test("the switch button steps through every camera and wraps around", () => {
  const three = [...mac, { deviceId: "usb", label: "Logitech BRIO" }];
  assert.equal(nextCamera(three, "iphone")?.deviceId, "builtin");
  assert.equal(nextCamera(three, "usb")?.deviceId, "iphone");
  assert.equal(nextCamera(three, undefined)?.deviceId, "iphone");
  assert.equal(nextCamera([mac[1]], "builtin"), undefined, "one camera: nothing to switch to");
});
