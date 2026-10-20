"""Find figures in a PDF and save each one as a PNG (needs PyMuPDF)."""
from __future__ import annotations

import os
from typing import Optional

from .figure_utils import parse_caption, locate_figure_region

MAX_SIDE_PX = 1600          # keeps vision requests small (Groq: 4 MB base64 / image)


def _tuple(r) -> tuple:
    return (float(r[0]), float(r[1]), float(r[2]), float(r[3]))


def _caption_text(blocks: list, idx: int) -> str:
    """Caption block text, plus the next block if the caption clearly continues."""
    text = " ".join(blocks[idx][4].split())
    if idx + 1 < len(blocks):
        nxt = blocks[idx + 1]
        nxt_text = " ".join(nxt[4].split())
        gap = nxt[1] - blocks[idx][3]
        if (not text.endswith((".", "!", "?")) and nxt_text[:1].islower() and 0 <= gap < 8):
            text += " " + nxt_text
    return text


def extract_figures(pdf_path: str, out_dir: str, max_figures: int = 30) -> list:
    """Return [{label, number, page, caption, path, bbox, fallback}], first occurrence per label.

    Never raises for an unreadable page; it just skips it.
    """
    import pymupdf as fitz  # PyMuPDF (the old `fitz` name is deprecated)

    os.makedirs(out_dir, exist_ok=True)
    found, seen = [], set()
    doc = fitz.open(pdf_path)
    try:
        for pno in range(len(doc)):
            if len(found) >= max_figures:
                break
            try:
                page = doc[pno]
                prect = _tuple(page.rect)
                blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
                caps = []
                for i, b in enumerate(blocks):
                    parsed = parse_caption(b[4])
                    if parsed:
                        caps.append((i, parsed[0], _tuple(b[:4])))
                if not caps:
                    continue
                graphics = [_tuple(i["bbox"]) for i in page.get_image_info()]
                try:
                    graphics += [_tuple(d["rect"]) for d in page.get_drawings()]
                except Exception:
                    pass
                cap_rects = [c[2] for c in caps]
                text_rects = [_tuple(b[:4]) for b in blocks]
                for idx, label, crect in caps:
                    if label in seen or len(found) >= max_figures:
                        continue
                    region = locate_figure_region(
                        crect, graphics,
                        [t for t in text_rects if t != crect and t not in cap_rects],
                        prect, cap_rects,
                    )
                    fallback = region is None
                    clip = fitz.Rect(*(region or prect))
                    zoom = min(2.5, MAX_SIDE_PX / max(clip.width, clip.height, 1))
                    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
                    num = label.split()[-1]
                    safe = "".join(ch for ch in num if ch.isalnum())
                    path = os.path.join(out_dir, f"fig_{safe}_p{pno + 1}.png")
                    pix.save(path)
                    if os.path.getsize(path) > 3_000_000:      # huge raster: fall back to JPEG
                        path_jpg = path[:-4] + ".jpg"
                        pix.save(path_jpg, jpg_quality=85)
                        os.remove(path)
                        path = path_jpg
                    seen.add(label)
                    found.append({
                        "label": label, "number": num, "page": pno + 1,
                        "caption": _caption_text(blocks, idx)[:1500],
                        "path": path, "bbox": list(clip), "fallback": fallback,
                    })
            except Exception:
                continue
    finally:
        doc.close()
    return found
