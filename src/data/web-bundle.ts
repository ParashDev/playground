import type { ProjectFile } from "../storage/db";

const HTML_PATTERN = /\.html?$/i;
const CSS_PATTERN = /\.css$/i;
const JS_PATTERN = /\.(m|c)?jsx?$/i;

/** Split so `</script>` inside user code cannot terminate the tag we emit. */
const escapeClosingTag = (source: string) => source.replace(/<\/script>/gi, "<\\/script>");

function insertBefore(document: string, marker: RegExp, addition: string): string | null {
  const match = marker.exec(document);
  if (!match) return null;
  return document.slice(0, match.index) + addition + document.slice(match.index);
}

/**
 * Assembles a project's web files into one HTML document.
 *
 * `index.html` (or the first .html file) is the page. Every .css file becomes a
 * `<style>` in the head and every .js file a `<script>` at the end of the body,
 * in filename order. Files not matching any of those extensions are ignored —
 * there is no module resolution here, this is a single document.
 *
 * `bootstrap` is injected as the very first thing in the head so console
 * patching and height reporting are in place before any user script runs.
 */
export function assembleWebDocument(files: ProjectFile[], bootstrap: string): string {
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  const page =
    ordered.find((file) => file.name.toLowerCase() === "index.html") ??
    ordered.find((file) => HTML_PATTERN.test(file.name));

  const styles = ordered
    .filter((file) => CSS_PATTERN.test(file.name))
    .map((file) => `<style data-file="${file.name}">\n${file.source}\n</style>`)
    .join("\n");

  const scripts = ordered
    .filter((file) => JS_PATTERN.test(file.name))
    .map((file) => `<script data-file="${file.name}">\n${escapeClosingTag(file.source)}\n</script>`)
    .join("\n");

  const head = `<script>${bootstrap}</script>\n${styles}`;
  const markup = page?.source ?? "";

  // A document with its own <html> shell gets the pieces threaded into it;
  // anything else is treated as body markup and wrapped.
  if (/<html[\s>]/i.test(markup)) {
    let result = markup;
    result =
      insertBefore(result, /<\/head\s*>/i, `${head}\n`) ??
      insertBefore(result, /<body[^>]*>/i, `<head>${head}</head>\n`) ??
      head + result;
    result = insertBefore(result, /<\/body\s*>/i, `${scripts}\n`) ?? result + scripts;
    return result;
  }

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    head,
    "</head>",
    "<body>",
    markup,
    scripts,
    "</body>",
    "</html>",
  ].join("\n");
}
