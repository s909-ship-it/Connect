/* The two call sounds, made with the Web Audio API so there are no sound files to load.

   "back" is what the caller hears while the other phone rings: the classic telephone ringback, two soft low tones
   (400 Hz and 450 Hz) sounding together as a warm purr, in the familiar "ring-ring … pause" rhythm.
   "ring" is what the person being called hears: an old desk-phone bell, two small gongs struck in turn twenty
   times a second, with the short shimmer a real bell leaves when it stops.

   Both follow the same rhythm: 0.4 s on, 0.2 s off, 0.4 s on, then 2 s of quiet. */
export type ToneKind = "ring" | "back";
export const CYCLE_SECONDS = 3;

/* Schedules one "ring-ring" starting at `at` (in the context's own clock). Works on a live or an offline context. */
export function scheduleRing(ctx: BaseAudioContext, kind: ToneKind, at: number) {
  const out = ctx.createGain(), soft = ctx.createBiquadFilter();
  out.gain.value = kind === "ring" ? 0.6 : 0.15;
  // Takes the hard edge off: a ringback is mellow, a bell is bright but not piercing.
  soft.type = "lowpass"; soft.frequency.value = kind === "ring" ? 5200 : 1400;
  out.connect(soft); soft.connect(ctx.destination);

  const burst = (t: number, len: number) => {
    const env = ctx.createGain();
    env.connect(out);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + (kind === "ring" ? 0.012 : 0.03));
    env.gain.setValueAtTime(1, t + len);
    // A bell keeps humming for a moment after the clapper stops; a line tone just fades out quickly.
    const tail = kind === "ring" ? 0.45 : 0.06;
    env.gain.exponentialRampToValueAtTime(0.0001, t + len + tail);
    const end = t + len + tail + 0.02;
    const voice = (freq: number, level: number, type: OscillatorType = "sine") => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = level;
      o.connect(g); g.connect(env); o.start(t); o.stop(end);
      return g;
    };
    if (kind === "back") {
      voice(400, 0.5); voice(450, 0.5);
      return;
    }
    // The clapper: a 20 Hz swing that makes one gong loud while the other is quiet, back and forth.
    const clapper = ctx.createOscillator();
    clapper.frequency.value = 20; clapper.start(t); clapper.stop(end);
    const gong = (freq: number, side: 1 | -1) => {
      const swing = ctx.createGain();
      swing.gain.value = 0.5 * side;
      clapper.connect(swing);
      // The gong's main note, plus the slightly off-pitch overtones that make metal sound like metal.
      for (const [mult, level] of [[1, 0.2], [2.76, 0.07], [5.4, 0.03]] as const) {
        const g = voice(freq * mult, level * 0.5);
        const scaled = ctx.createGain();
        scaled.gain.value = level;
        swing.connect(scaled); scaled.connect(g.gain);
      }
    };
    gong(1245, 1); gong(1560, -1);
  };
  burst(at, 0.4);
  burst(at + 0.6, 0.4);
}

/* Starts the sound and keeps repeating it. Returns a function that stops it. */
export function tone(kind: ToneKind) {
  let ctx: AudioContext | null = null, stop = false;
  try { ctx = new AudioContext(); } catch { return () => {}; }
  const cycle = () => {
    if (stop || !ctx) return;
    scheduleRing(ctx, kind, ctx.currentTime + 0.05);
    setTimeout(cycle, CYCLE_SECONDS * 1000);
  };
  void ctx.resume().then(cycle);
  return () => { if (stop) return; stop = true; ctx?.close().catch(() => {}); };
}
