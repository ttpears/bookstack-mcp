// BookStack only populates page.text for markdown-authored pages. For pages
// written in the WYSIWYG editor it comes back empty, so a word count taken
// from page.text alone reports 0 for pages that plainly have content (#10).
// Fall back to whichever body the response actually carries.

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
}

export function countWords(page: {
  text?: string | null;
  markdown?: string | null;
  html?: string | null;
}): number {
  const source =
    page.text || page.markdown || (page.html ? stripHtml(page.html) : '');
  // Split on any whitespace, not a single space: a page whose lines are
  // newline-separated counts as one word under /' '/.
  return source.split(/\s+/).filter(Boolean).length;
}
