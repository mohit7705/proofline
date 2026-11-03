import { useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { describeAiError } from "../../lib/analysis";
import { formatClock } from "../../lib/format";
import { transcribeVoiceNote } from "../../services/api";

/** A note that shows three lines, with a toggle to read the rest. */
function FoldedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return (
    <>
      <p className={long && !open ? "fold-clamp" : undefined}>“{text}”</p>
      {long ? (
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </>
  );
}

/** Optional spoken note. It becomes text in the task history. It is a note, not evidence. */
export function VoiceNote({ taskId, disabled }: { taskId: string; disabled?: boolean }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const picker = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    setSending(true);
    setError("");
    try {
      const result = await transcribeVoiceNote(taskId, file);
      if (!result.transcript.trim())
        setError("No speech was heard in that recording. Try again a little closer to the microphone.");
      else setNotes((current) => [...current, result.transcript.trim()]);
    } catch (err) {
      setError(describeAiError(err, "Couldn't turn that recording into text."));
    } finally {
      setSending(false);
    }
  }

  const recorder = useVoiceRecorder((file) => void send(file));

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !/\.(wav|mp3|mp4|m4a|webm|ogg|oga|opus|aac|flac|mov)$/i.test(file.name) &&
      !/^(audio|video)\//i.test(file.type)
    ) {
      setError("Choose an audio or video file (WAV, MP3, MP4, M4A, WebM or OGG).");
      return;
    }
    void send(file);
  }

  const problem = recorder.error || error;

  return (
    <section className="voice" aria-label="Voice note">
      <h3 className="sub-title">
        Voice note <span className="field-optional">Optional</span>
      </h3>
      <p className="muted small">
        Say what you checked. It is turned into text and saved in the task history. It is a note, not proof:
        your photos and videos stay the evidence. The audio itself is not kept.
      </p>

      <div className="recorder">
        {recorder.recording ? (
          <>
            <span className="recorder-dot" aria-hidden="true" />
            <span className="num" role="timer">
              {formatClock(recorder.seconds)}
            </span>
            <Button size="s" variant="dark" onClick={recorder.stop}>
              Stop and add note
            </Button>
            <Button size="s" variant="ghost" onClick={recorder.cancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="s" onClick={() => void recorder.start()} disabled={disabled || sending}>
              <Icon name="mic" size={15} />
              Record voice note
            </Button>
            <input
              ref={picker}
              type="file"
              accept="audio/*,video/mp4,video/webm,.wav,.mp3,.mp4,.m4a,.webm,.ogg,.opus,.aac,.flac,.mov"
              className="sr-only"
              onChange={onPick}
              tabIndex={-1}
              aria-hidden="true"
            />
            <Button
              size="s"
              variant="ghost"
              onClick={() => picker.current?.click()}
              disabled={disabled || sending}
            >
              Choose audio file
            </Button>
          </>
        )}
      </div>

      {sending ? (
        <p className="muted small" role="status">
          Turning your voice into text…
        </p>
      ) : null}
      {problem ? <p className="field-error">{problem}</p> : null}

      {notes.length > 0 ? (
        <ul className="history">
          {notes.map((text, index) => (
            <li key={`${index}-${text.slice(0, 12)}`}>
              <FoldedText text={text} />
              <p className="muted small">Saved to the task history.</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}