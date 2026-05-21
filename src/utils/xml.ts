export interface XmlValidation {
  valid: boolean;
  message?: string;
  line?: number;
  column?: number;
}

export function formatXml(xml: string): string {
  if (!xml.trim()) return xml;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml.trim(), 'application/xml');
    if (doc.querySelector('parsererror')) return xml;
    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(doc);
    let formatted = '';
    let indent = 0;
    raw
      .replace(/>\s*</g, '><')
      .split(/(<[^>]+>)/g)
      .filter(Boolean)
      .forEach((node) => {
        if (/^<\/\w/.test(node)) indent--;
        formatted += '  '.repeat(Math.max(indent, 0)) + node + '\n';
        if (/^<\w[^/]*[^/]>$/.test(node)) indent++;
      });
    return formatted.trim();
  } catch {
    return xml;
  }
}

export function validateXml(xml: string): XmlValidation {
  if (!xml.trim()) return { valid: true };
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    const parserError = doc.querySelector('parsererror');
    if (!parserError) return { valid: true };
    const text = parserError.textContent || 'Invalid XML';
    const lineMatch = text.match(/[Ll]ine[^\d]*(\d+)/);
    const colMatch = text.match(/[Cc]olumn[^\d]*(\d+)/);
    const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 240);
    return {
      valid: false,
      message: cleaned,
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      column: colMatch ? parseInt(colMatch[1], 10) : undefined,
    };
  } catch (e) {
    return { valid: false, message: e instanceof Error ? e.message : 'Invalid XML' };
  }
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

export function byteSize(text: string): number {
  if (!text) return 0;
  return new Blob([text]).size;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'text/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
