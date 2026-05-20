import mammoth from 'mammoth';
import PDFParser from 'pdf2json';

function normalize(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const extractPdfText = (buffer) => {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on('pdfParser_dataError', (err) => {
      reject(new Error(err.parserError));
    });

    pdfParser.on('pdfParser_dataReady', () => {
      const text = pdfParser.getRawTextContent();
      resolve(text);
    });

    pdfParser.parseBuffer(buffer);
  });
};

export async function extractText(buffer, type) {
  let raw;

  if (type === 'pdf') {
    raw = await extractPdfText(buffer);
  } else if (type === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    raw = result.value;
  } else {
    throw new Error(`Unsupported type: ${type}`);
  }

  const text = normalize(raw);
  if (text.length < 30) {
    throw new Error('Could not extract readable text. Is this a scanned image?');
  }
  return text;
}