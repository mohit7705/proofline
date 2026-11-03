import { describe, expect, it } from "vitest";
import { downsample, encodeWavBytes } from "./wav";

function text(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
}

describe("encodeWavBytes", () => {
  it("writes a mono 16-bit PCM header the server accepts", () => {
    const bytes = encodeWavBytes(new Float32Array([0, 0.5, -0.5, 1]), 16000);
    const view = new DataView(bytes);
    expect(bytes.byteLength).toBe(44 + 4 * 2);
    expect(text(view, 0, 4)).toBe("RIFF");
    expect(text(view, 8, 4)).toBe("WAVE");
    expect(text(view, 12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(8);
  });

  it("converts samples to signed 16-bit and clips loud ones", () => {
    const view = new DataView(encodeWavBytes(new Float32Array([0, 1, -1, 5]), 16000));
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(32767);
  });
});

describe("downsample", () => {
  it("averages groups of samples", () => {
    const out = downsample(new Float32Array([1, 3, 5, 7]), 4, 2);
    expect(Array.from(out)).toEqual([2, 6]);
  });

  it("keeps a recording that is already at or below the target rate", () => {
    const input = new Float32Array([1, 2, 3]);
    expect(downsample(input, 16000, 16000)).toBe(input);
    expect(downsample(input, 8000, 16000)).toBe(input);
  });

  it("gives about a third of the samples from 48 kHz to 16 kHz", () => {
    expect(downsample(new Float32Array(4800), 48000, 16000).length).toBe(1600);
  });
});
