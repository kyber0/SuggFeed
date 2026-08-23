"use client";
import { useCallback, useRef, useState } from "react";
import { Paperclip, FileText, X } from "lucide-react";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 5 * 1024 * 1024;

export function FileDropzone({
  files, onChange, onError,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onError: (msg: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((selected: File[]): File[] | null => {
    if (files.length + selected.length > 3) {
      onError("You can attach up to 3 files total."); return null;
    }
    for (const f of selected) {
      if (!ALLOWED_TYPES.includes(f.type)) { onError(`"${f.name}" must be a JPEG, PNG, WebP, or PDF.`); return null; }
      if (f.size > MAX_SIZE) { onError(`"${f.name}" exceeds the 5 MB limit.`); return null; }
    }
    return [...files, ...selected];
  }, [files, onError]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const next = validate(Array.from(e.dataTransfer.files));
    if (next) onChange(next);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const next = validate(Array.from(e.target.files ?? []));
    if (next) onChange(next);
    e.target.value = "";
  }

  function remove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div
        className={`dropzone${dragOver ? " drag-over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        aria-label="Click or drag files to attach"
      >
        <Paperclip className="dz-icon" size={28} strokeWidth={1.5} />
        <p><b>Click to browse</b> or drag &amp; drop</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>JPEG · PNG · WebP · PDF · up to 5 MB each · max 3 files</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          style={{ display: "none" }}
          onChange={handleInput}
        />
      </div>

      {files.length > 0 && (
        <div className="file-previews">
          {files.map((file, i) => (
            <div key={`${file.name}-${i}`} className="file-thumb">
              {file.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={URL.createObjectURL(file)} alt={file.name} />
              ) : (
                <FileText size={28} strokeWidth={1.5} color="var(--muted)" />
              )}
              <button
                className="remove-btn"
                onClick={(e) => { e.stopPropagation(); remove(i); }}
                aria-label={`Remove ${file.name}`}
                type="button"
              ><X size={10} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
