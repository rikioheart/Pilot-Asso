import { useMemo, useRef } from "react";
import ReactQuill from "react-quill-new";
import DOMPurify from "dompurify";
import { toast } from "sonner";
import "react-quill-new/dist/quill.snow.css";

const MAX_IMAGE_BYTES = 350 * 1024;
const MAX_SIDE = 1200;

/** Compresse une image côté navigateur (redimensionnement + JPEG) avant insertion. */
export async function compressImage(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error("Image trop volumineuse (12 Mo max).");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let quality = 0.85;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length * 0.75 > MAX_IMAGE_BYTES && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length * 0.75 > MAX_IMAGE_BYTES) throw new Error("Image trop lourde même compressée : réduisez-la.");
  return out;
}

const FORMATS = ["header", "bold", "italic", "underline", "list", "link", "image"];

export const RichTextEditor = ({ value, onChange, placeholder, testId = "rich-editor" }) => {
  const quillRef = useRef(null);

  const modules = useMemo(() => ({
    toolbar: {
      container: [[{ header: [2, 3, false] }], ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }], ["link", "image"], ["clean"]],
      handlers: {
        image() {
          const input = document.createElement("input");
          input.type = "file"; input.accept = "image/*";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
              const dataUrl = await compressImage(file);
              const editor = quillRef.current?.getEditor();
              const range = editor.getSelection(true);
              editor.insertEmbed(range.index, "image", dataUrl, "user");
              editor.setSelection(range.index + 1);
            } catch (e) { toast.error(e.message || "Image refusée"); }
          };
          input.click();
        },
      },
    },
  }), []);

  return (
    <div data-testid={testId} className="rich-editor rounded-md border bg-background">
      <ReactQuill ref={quillRef} theme="snow" value={value || ""} onChange={onChange}
        modules={modules} formats={FORMATS} placeholder={placeholder} />
    </div>
  );
};

export const sanitizeHtml = (html) => DOMPurify.sanitize(html || "", {
  ALLOWED_TAGS: ["h1", "h2", "h3", "p", "br", "strong", "em", "u", "b", "i", "ol", "ul", "li", "a", "img", "span"],
  ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "class"],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|data:image\/(?:jpeg|png|webp|gif);base64,|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
});

const looksLikeHtml = (s) => /<[a-z][\s\S]*>/i.test(s || "");

/** Affiche un contenu enrichi (HTML) ou, pour les anciens guides, du texte brut. */
export const RichContent = ({ html, testId = "rich-content" }) => {
  if (!looksLikeHtml(html)) {
    return <p className="whitespace-pre-wrap text-base leading-relaxed" data-testid={testId}>{html}</p>;
  }
  return <div className="rich-content text-base leading-relaxed" data-testid={testId}
    dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
};
