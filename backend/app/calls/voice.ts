/* The voice changer for anonymous people. It runs in their own browser before the sound leaves the device, so the
   real voice never reaches the other person or Connect's server.
   It is the classic delay-line pitch shifter (Chris Wilson's "Jungle" design, built from plain Web Audio nodes):
   two delay lines whose delay time sweeps steadily, crossfaded so the jumps are never heard, shift the pitch down.
   A small band filter then changes the colour of the voice, so it does not just sound slowed down. */

const BUFFER = 0.1, FADE = 0.05, DELAY = 0.1;

function fadeBuffer(ctx: BaseAudioContext) {
  const n1 = Math.floor(BUFFER * ctx.sampleRate), n2 = Math.floor((BUFFER - 2 * FADE) * ctx.sampleRate), fade = FADE * ctx.sampleRate;
  const b = ctx.createBuffer(1, n1 + n2, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n1; i++) d[i] = i < fade ? Math.sqrt(i / fade) : i >= n1 - fade ? Math.sqrt(1 - (i - (n1 - fade)) / fade) : 1;
  return b;
}
function sweepBuffer(ctx: BaseAudioContext, up: boolean) {
  const n1 = Math.floor(BUFFER * ctx.sampleRate), n2 = Math.floor((BUFFER - 2 * FADE) * ctx.sampleRate);
  const b = ctx.createBuffer(1, n1 + n2, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n1; i++) d[i] = up ? (n1 - i) / (n1 + n2) : i / n1;
  return b;
}

/* Builds the shifter: input -> output, pitch moved by `shift` (-1 to 1; negative is deeper). */
export function pitchShifter(ctx: BaseAudioContext, shift: number) {
  const input = ctx.createGain(), output = ctx.createGain();
  const buf = sweepBuffer(ctx, shift > 0), fades = fadeBuffer(ctx);
  const mods = [ctx.createBufferSource(), ctx.createBufferSource()], crossfades = [ctx.createBufferSource(), ctx.createBufferSource()];
  const amounts = [ctx.createGain(), ctx.createGain()], delays = [ctx.createDelay(1), ctx.createDelay(1)], mixes = [ctx.createGain(), ctx.createGain()];
  const at = ctx.currentTime + 0.05;
  for (let k = 0; k < 2; k++) {
    mods[k].buffer = buf; mods[k].loop = true;
    crossfades[k].buffer = fades; crossfades[k].loop = true;
    amounts[k].gain.value = 0.5 * DELAY * Math.abs(shift);
    mixes[k].gain.value = 0;
    mods[k].connect(amounts[k]); amounts[k].connect(delays[k].delayTime);
    crossfades[k].connect(mixes[k].gain);
    input.connect(delays[k]); delays[k].connect(mixes[k]); mixes[k].connect(output);
    // The second line runs half a cycle behind the first, so one is always fading in while the other fades out.
    const start = k === 0 ? at : at + BUFFER - FADE;
    mods[k].start(start); crossfades[k].start(start);
  }
  return { input, output, stop: () => [...mods, ...crossfades].forEach((s) => { try { s.stop(); } catch { /* already stopped */ } }) };
}

/* A copy of `stream` whose sound is disguised. Video tracks are left out: anonymous people never send video. */
export function disguise(stream: MediaStream, shift = -0.42): { stream: MediaStream; stop: () => void } {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const shifter = pitchShifter(ctx, shift);
  const colour = ctx.createBiquadFilter();
  colour.type = "peaking"; colour.frequency.value = 1400; colour.Q.value = 0.9; colour.gain.value = 5;
  const level = ctx.createGain(); level.gain.value = 1.3;
  const out = ctx.createMediaStreamDestination();
  src.connect(shifter.input); shifter.output.connect(colour); colour.connect(level); level.connect(out);
  void ctx.resume().catch(() => {});
  const track = out.stream.getAudioTracks()[0];
  // Muting the call mutes the real microphone; the disguised track follows it.
  return {
    stream: new MediaStream(track ? [track] : []),
    stop: () => { shifter.stop(); stream.getTracks().forEach((t) => t.stop()); void ctx.close().catch(() => {}); },
  };
}
