// fileValidator.js — strict, security-first upload validation.
// Rejects by actual file content (magic bytes), not just the extension.

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB cap

const ALLOWED = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

// Magic bytes: the first bytes of a file identify its REAL type,
// no matter what the extension or claimed MIME type says.
function detectType(buffer) {
  if (buffer.length < 4) return null;
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') return 'pdf';
  if (buffer[0] === 0x50 && buffer[1] === 0x4b &&
      buffer[2] === 0x03 && buffer[3] === 0x04) return 'docx';
  return null;
}

export function validateUpload(file) {
  if (!file) return { ok: false, error: 'No file was uploaded.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'File exceeds the 5 MB limit.' };

  // Check 1: browser-claimed MIME type must be on the allowlist.
  const claimedType = ALLOWED[file.mimetype];
  if (!claimedType) return { ok: false, error: 'Only PDF and DOCX files are accepted.' };

  // Check 2: the file's actual magic bytes must match a known type.
  const realType = detectType(file.buffer);
  if (!realType) return { ok: false, error: 'File content is not a valid PDF or DOCX.' };

  // Check 3: claimed type and real type must agree.
  // A mismatch means a file was renamed to disguise it — reject.
  if (claimedType !== realType) return { ok: false, error: 'File type does not match its contents.' };

  return { ok: true, type: realType };
}