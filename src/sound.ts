/**
 * The page-turn sound, synthesised rather than shipped.
 *
 * A paper turn is a short burst of filtered noise with a fast attack and a soft
 * tail, which WebAudio can make in a few lines. That means no audio file to ship,
 * no licence to track, and nothing extra to download.
 */
export interface FlipSound {
  play(): void;
  destroy(): void;
}

export function createFlipSound(volume = 0.35): FlipSound {
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;

  function ready(): boolean {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    // Created on first use: a context made before a gesture starts suspended.
    if (!ctx) ctx = new Ctor();
    if (!noise) {
      const length = Math.floor(ctx.sampleRate * 0.35);
      noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i++) {
        // Brown-ish noise: closer to paper than white noise, which sounds like static.
        data[i] = (data[i - 1] ?? 0) * 0.72 + (Math.random() * 2 - 1) * 0.28;
      }
    }
    return true;
  }

  return {
    play() {
      if (!ready() || !ctx || !noise) return;
      void ctx.resume();

      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.playbackRate.value = 0.85 + Math.random() * 0.3;

      // A sweeping band-pass is what gives the sense of a sheet passing by.
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.setValueAtTime(900, ctx.currentTime);
      band.frequency.exponentialRampToValueAtTime(2600, ctx.currentTime + 0.18);
      band.Q.value = 0.7;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);

      source.connect(band).connect(gain).connect(ctx.destination);
      source.start();
      source.stop(ctx.currentTime + 0.32);
    },
    destroy() {
      void ctx?.close();
      ctx = null;
      noise = null;
    },
  };
}
