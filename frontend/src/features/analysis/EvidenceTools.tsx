import { Card, CardHeader } from "../../components/ui/Primitives";
import type { Evidence, SegmentBox } from "../../types";
import { AnalysisPanel } from "./AnalysisPanel";
import { ImageTools } from "./ImageTools";

interface Props {
  evidence: Evidence;
  evidenceInTask: Evidence[];
  onSeek: (seconds: number) => void;
  onChanged: () => void;
  onOpen: (evidence: Evidence) => void;
  onBoxes: (boxes: SegmentBox[]) => void;
}

/** The AI tools that fit the selected file: frame analysis for a video, duplicate check and highlighting for a photo. */
export function EvidenceTools({ evidence, evidenceInTask, onSeek, onChanged, onOpen, onBoxes }: Props) {
  if (evidence.media_type === "video") {
    return (
      <Card>
        <CardHeader title="AI frame analysis" hint="Advice for the reviewer." />
        <AnalysisPanel key={evidence.id} evidence={evidence} onSeek={onSeek} onChanged={onChanged} />
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title="Photo checks" hint="Aids for the reviewer. Not verdicts." />
      <ImageTools
        key={evidence.id}
        evidence={evidence}
        inTask={evidenceInTask}
        onOpen={onOpen}
        onBoxes={onBoxes}
      />
    </Card>
  );
}
