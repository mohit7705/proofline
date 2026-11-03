import { useRef } from "react";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";

interface Props {
  disabled?: boolean;
  wantsVideo?: boolean;
  wantsPhoto?: boolean;
  onFiles: (files: File[]) => void;
}

/** Camera shortcuts on phones, plus a normal file picker. Each input is reset so the same file can be chosen again. */
export function CaptureButtons({ disabled, wantsVideo = true, wantsPhoto = true, onFiles }: Props) {
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const any = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) onFiles(files);
  };

  return (
    <div className="capture-buttons">
      {wantsPhoto ? (
        <>
          <input
            ref={photo}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={handle}
            tabIndex={-1}
            aria-hidden="true"
          />
          <Button size="s" variant="primary" disabled={disabled} onClick={() => photo.current?.click()}>
            <Icon name="camera" size={15} />
            Take photo
          </Button>
        </>
      ) : null}
      {wantsVideo ? (
        <>
          <input
            ref={video}
            type="file"
            accept="video/mp4,video/webm"
            capture="environment"
            className="sr-only"
            onChange={handle}
            tabIndex={-1}
            aria-hidden="true"
          />
          <Button size="s" variant="primary" disabled={disabled} onClick={() => video.current?.click()}>
            <Icon name="video" size={15} />
            Record video
          </Button>
        </>
      ) : null}
      <input
        ref={any}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        multiple
        className="sr-only"
        onChange={handle}
        tabIndex={-1}
        aria-hidden="true"
      />
      <Button size="s" disabled={disabled} onClick={() => any.current?.click()}>
        <Icon name="upload" size={15} />
        Choose files
      </Button>
    </div>
  );
}
