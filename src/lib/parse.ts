import mammoth from 'mammoth';

export const MIN_EXTRACTED_CHARS = 200;

export class ExtractionError extends Error {}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/[ \t]+/g, ' ');
    pages.push(text);
  }
  return pages.join('\n\n');
}

async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
}

/** Returns raw text. Throws ExtractionError if the file yields too little to parse. */
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  let text = '';

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    text = await extractPdf(file);
  } else if (name.endsWith('.docx')) {
    text = await extractDocx(file);
  } else if (name.endsWith('.txt') || name.endsWith('.md')) {
    text = await file.text();
  } else {
    throw new ExtractionError('Unsupported file type. Use PDF, DOCX, or paste the text.');
  }

  if (text.trim().length < MIN_EXTRACTED_CHARS) {
    throw new ExtractionError("We couldn't read that file. Try pasting the text instead.");
  }
  return text.trim();
}
