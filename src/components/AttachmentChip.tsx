import type { Attachment, AttachmentKind } from "@/lib/pact/types";
import { CloseIcon, FileIcon, GitHubIcon, LinkIcon } from "./Icons";

const ICONS: Record<AttachmentKind, typeof FileIcon> = {
  file: FileIcon,
  link: LinkIcon,
  github: GitHubIcon,
};

interface AttachmentChipProps {
  attachment: Attachment;
  onRemove?: () => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const Glyph = ICONS[attachment.kind];
  const uploading = attachment.detail === "Uploading…";
  return (
    <span className={uploading ? "chip is-uploading" : "chip"} title={attachment.detail ?? attachment.label} aria-busy={uploading || undefined}>
      <Glyph width={13} height={13} />
      <span className="chip__label">{attachment.label}</span>
      {uploading && <span className="chip__status">uploading</span>}
      {onRemove && (
        <button type="button" className="chip__remove" onClick={onRemove} aria-label={`Remove ${attachment.label}`}>
          <CloseIcon width={11} height={11} />
        </button>
      )}
    </span>
  );
}
