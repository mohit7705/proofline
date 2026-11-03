import { useCallback, useEffect, useRef, useState } from "react";
import { downsample, encodeWav } from "../lib/wav";

const TARGET_RATE = 16000;

interface Session {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  chunks: Float32Array[];
  timer: number;
}

/** Push-to-talk recorder. `onRecorded` gets a WAV file when the person stops (or after `maxSeconds`). */
export function useVoiceRecorder(onRecorded: (file: File) => void, maxSeconds = 90) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const session = useRef<Session | null>(null);
  const callback = useRef(onRecorded);

  useEffect(() => {
    callback.current = onRecorded;
  });

  const finish = useCallback((keep: boolean) => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    window.clearInterval(s.timer);
    s.processor.onaudioprocess = null;
    s.processor.disconnect();
    s.source.disconnect();
    s.stream.getTracks().forEach((track) => track.stop());
    const rate = s.context.sampleRate;
    void s.context.close();
    setRecording(false);
    if (!keep) return;

    const total = s.chunks.reduce((n, chunk) => n + chunk.length, 0);
    if (total < rate / 2) {
      setError("That recording was too short. Press record, say what you checked, then stop.");
      return;
    }
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of s.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const outRate = Math.min(rate, TARGET_RATE);
    callback.current(
      new File([encodeWav(downsample(merged, rate, TARGET_RATE), outRate)], "voice-note.wav", {
        type: "audio/wav",
      }),
    );
  }, []);

  const start = useCallback(async () => {
    setError("");
    if (session.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio. Choose an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new Context();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(context.destination); // needed for the processor to run; it outputs silence

      let elapsed = 0;
      const timer = window.setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= maxSeconds) finish(true);
      }, 1000);

      session.current = { context, stream, source, processor, chunks, timer };
      setSeconds(0);
      setRecording(true);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser, or choose an audio file instead."
          : "Couldn't start the microphone. Choose an audio file instead.",
      );
    }
  }, [finish, maxSeconds]);

  const stop = useCallback(() => finish(true), [finish]);
  const cancel = useCallback(() => finish(false), [finish]);

  // Release the microphone if the screen is closed mid-recording.
  useEffect(() => () => finish(false), [finish]);

  return { recording, seconds, error, start, stop, cancel };
}
