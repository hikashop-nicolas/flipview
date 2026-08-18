/**
 * The page-turn sound, synthesised rather than shipped.
 *
 * Paper is not a whoosh. A turning sheet is a crackle: dozens of tiny transients
 * a few milliseconds long as the fibres release, densest while the page is moving
 * fastest, followed by a soft landing as it settles. A single smooth noise burst,
 * however it is filtered, reads as wind instead.
 *
 * So the buffer is built from grains rather than from filtered noise, and it is
 * rebuilt on every turn with fresh randomness: two real page turns never sound
 * identical, and a sample that repeats exactly is the thing that gives a synthetic
 * sound away.
 *
 * Synthesising it means no audio file to ship, no licence to track, and nothing
 * extra to download.
 */
export interface FlipSound {
  play(): void;
  destroy(): void;
}

const DURATION = 0.36;

/**
 * @param volume 0 to 1.
 * @param urls   Recordings to play instead of the synthesised turn. Several are
 *               picked between at random, because one sample repeating on every
 *               turn is worse than a synthetic one. The synthesis stays as the
 *               fallback: if a file is missing or the browser will not decode it,
 *               the book still sounds like a book.
 */
export function createFlipSound(volume = 0.35, urls: string[] = []): FlipSound {
  let ctx: AudioContext | null = null;
  const encoded = new Map<string, Promise<ArrayBuffer>>();
  const decoded = new Map<string, AudioBuffer>();

  // Fetching starts now, decoding waits for a context, which waits for a gesture.
  for (const url of urls) {
    encoded.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`flipview: cannot load ${url}`);
        return r.arrayBuffer();
      }),
    );
  }

  function decode(audio: AudioContext): void {
    for (const [url, pending] of encoded) {
      encoded.delete(url);
      void pending
        .then((bytes) => audio.decodeAudioData(bytes))
        .then((buffer) => decoded.set(url, buffer))
        .catch(() => undefined);
    }
  }

  function context(): AudioContext | null {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    // Created on first use: a context made before a gesture starts suspended.
    if (!ctx) ctx = new Ctor();
    return ctx;
  }

  function rustle(audio: AudioContext): AudioBuffer {
    const rate = audio.sampleRate;
    const buffer = audio.createBuffer(1, Math.floor(rate * DURATION), rate);
    renderRustle(buffer.getChannelData(0), rate);
    return buffer;
  }

  return {
    play() {
      const audio = context();
      if (!audio) return;
      void audio.resume();
      decode(audio);

      const recordings = [...decoded.values()];
      if (recordings.length > 0) {
        const source = audio.createBufferSource();
        source.buffer = recordings[Math.floor(Math.random() * recordings.length)];
        // A little variation, so a repeat does not sound like a repeat.
        source.playbackRate.value = 0.94 + Math.random() * 0.12;
        const level = audio.createGain();
        level.gain.value = volume;
        source.connect(level).connect(audio.destination);
        source.start();
        return;
      }

      const source = audio.createBufferSource();
      source.buffer = rustle(audio);

      // Paper has almost nothing low in it: without this it sounds like a curtain.
      const highpass = audio.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 700 + Math.random() * 200;

      // A gentle sweep upward as the page passes, rather than a fixed colour.
      const body = audio.createBiquadFilter();
      body.type = "bandpass";
      body.frequency.setValueAtTime(1800, audio.currentTime);
      body.frequency.exponentialRampToValueAtTime(4200, audio.currentTime + DURATION * 0.7);
      body.Q.value = 0.5;

      const gain = audio.createGain();
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.setValueAtTime(volume, audio.currentTime + DURATION * 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + DURATION);

      source.connect(highpass).connect(body).connect(gain).connect(audio.destination);
      source.start();
      source.stop(audio.currentTime + DURATION + 0.02);
    },
    destroy() {
      void ctx?.close();
      ctx = null;
      encoded.clear();
      decoded.clear();
    },
  };
}

/** How fast the sheet is moving, 0 to 1, over the length of the turn. */
function motion(t: number): number {
  // Slow start, quick middle, trailing off: the shape of a hand turning a page.
  return Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 1.4;
}

/**
 * Writes one page turn into `data`. Pure arithmetic, no audio API, so the shape of
 * the sound can be tested: what separates paper from wind is that it is made of
 * many discrete transients, and that is measurable.
 */
export function renderRustle(data: Float32Array, rate: number, random: () => number = Math.random): void {
  const length = data.length;

  // Grains, not noise: each two to eight milliseconds long, bunched where the page
  // is moving fastest, which is what fibres releasing sound like.
  const grains = Math.floor(120 + random() * 60);
  for (let g = 0; g < grains; g++) {
    const at = random() ** 0.8;
    const speed = motion(at);
    if (random() > 0.25 + speed * 0.75) continue;

    const start = Math.floor(at * length);
    const span = Math.floor(rate * (0.002 + random() * 0.006));
    const amp = (0.25 + random() * 0.75) * speed;

    for (let i = 0; i < span && start + i < length; i++) {
      const k = i / span;
      // Sharp attack, quick decay: a click with a tail, not a tone.
      data[start + i] += (random() * 2 - 1) * amp * (1 - k) ** 2.2;
    }
  }

  // The sheet landing: a short, duller thud under the last of the crackle.
  const landing = Math.floor(length * 0.82);
  let low = 0;
  for (let i = landing; i < length; i++) {
    const k = (i - landing) / (length - landing);
    low = low * 0.86 + (random() * 2 - 1) * 0.14;
    data[i] += low * 0.7 * (1 - k) ** 1.6;
  }

  // Keep the peak in range whatever the randomness produced.
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) {
    for (let i = 0; i < length; i++) data[i] /= peak;
  }
}
