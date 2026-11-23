// Ambil teks mentah sebuah value top-level dari string JSON, tanpa parse ulang.
// Dipakai untuk signature: BE Kledo (PHP) meng-HMAC teks JSON `data` persis seperti dikirim,
// termasuk escape `\/` dan `\uXXXX`. JSON.stringify di JS tidak menghasilkan teks yang sama.

function skipString(text, start) {
  let i = start + 1;

  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
    } else if (text[i] === '"') {
      return i;
    } else {
      i++;
    }
  }

  return text.length - 1;
}

function skipWhitespace(text, start) {
  let i = start;

  while (i < text.length && /\s/.test(text[i])) {
    i++;
  }

  return i;
}

function findValueEnd(text, start) {
  let depth = 0;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      i = skipString(text, i);
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      if (depth === 0) {
        return i;
      }

      depth--;
    } else if (ch === "," && depth === 0) {
      return i;
    }
  }

  return text.length;
}

export function extractTopLevelValue(text, key) {
  let depth = 0;
  let expectKey = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      const end = skipString(text, i);

      if (depth === 1 && expectKey) {
        const name = JSON.parse(text.slice(i, end + 1));
        const colon = skipWhitespace(text, end + 1);
        const valueStart = skipWhitespace(text, colon + 1);

        if (name === key) {
          return text.slice(valueStart, findValueEnd(text, valueStart)).trimEnd();
        }

        expectKey = false;
      }

      i = end;
    } else if (ch === "{" || ch === "[") {
      depth++;

      if (depth === 1) {
        expectKey = ch === "{";
      }
    } else if (ch === "}" || ch === "]") {
      depth--;
    } else if (ch === "," && depth === 1) {
      expectKey = true;
    }
  }

  return null;
}
