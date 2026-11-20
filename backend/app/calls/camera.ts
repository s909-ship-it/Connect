/* Choosing the camera for a video call. A computer can see several: its own, a USB webcam, and an iPhone through
   Continuity Camera. Left to itself the browser may pick the iPhone, which sends only a black picture with a padlock
   while the phone is locked or in a pocket. So a computer uses the camera the person last picked, else its built-in
   one, else any that is not a phone. Phones are left alone: they start on the front camera. */
export type Cam = { deviceId: string; label: string };

const BUILT_IN = /facetime|built-?in|integrated|internal|hd webcam|hd camera/i;
const PHONE_CAM = /iphone|continuity|desk view|android|droidcam|camo|epoccam/i;

export function chooseCamera(cams: Cam[], saved: string | null, phone: boolean): string | undefined {
  if (phone || cams.length < 2 || !cams.some((c) => c.label)) return undefined;
  if (saved && cams.some((c) => c.deviceId === saved)) return saved;
  // An iPhone through Continuity Camera is named after the phone ("Aadi Camera"), so it is found by not being built in.
  return (cams.find((c) => BUILT_IN.test(c.label)) ?? cams.find((c) => !PHONE_CAM.test(c.label)))?.deviceId;
}

/* The camera after the current one, for the switch-camera button on a computer. */
export function nextCamera(cams: Cam[], current: string | undefined): Cam | undefined {
  if (cams.length < 2) return undefined;
  const at = cams.findIndex((c) => c.deviceId === current);
  return cams[(at + 1) % cams.length];
}
