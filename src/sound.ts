/**
 * The page-turn sound: recordings the host supplies, nothing synthesised.
 *
 * The library ships no audio of its own, so there is nothing to license and
 * nothing extra to download for a book that turns silently.
 */
export interface FlipSound {
  play(): void;
  destroy(): void;
}

/**
 * @param urls   One recording or several. Several are picked between at random,
 *               because one sample repeating on every turn is worse than none.
 * @param volume 0 to 1.
 */
export function createFlipSound(urls: string[], volume = 0.35): FlipSound {
  let ctx: AudioContext | null = null;
  const encoded = new Map<string, Promise<ArrayBuffer>>();
  const decoded: AudioBuffer[] = [];

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

  function context(): AudioContext | null {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    // Created on first use: a context made before a gesture starts suspended.
    if (!ctx) ctx = new Ctor();
    return ctx;
  }

  function decode(audio: AudioContext): void {
    for (const [url, pending] of encoded) {
      encoded.delete(url);
      void pending
        .then((bytes) => audio.decodeAudioData(bytes))
        .then((buffer) => decoded.push(buffer))
        .catch(() => undefined);
    }
  }

  return {
    play() {
      const audio = context();
      if (!audio) return;
      void audio.resume();
      decode(audio);

      if (decoded.length === 0) return;

      const source = audio.createBufferSource();
      source.buffer = decoded[Math.floor(Math.random() * decoded.length)];
      // A little variation, so a repeat does not sound like a repeat.
      source.playbackRate.value = 0.94 + Math.random() * 0.12;

      const level = audio.createGain();
      level.gain.value = volume;

      source.connect(level).connect(audio.destination);
      source.start();
    },
    destroy() {
      void ctx?.close();
      ctx = null;
      encoded.clear();
      decoded.length = 0;
    },
  };
}
