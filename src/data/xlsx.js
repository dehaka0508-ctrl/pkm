// Minimal .xlsx reader/writer (works in browser and Node). Only plain text cells.
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function colName(i) {
  let s = "";
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function colIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** sheets: [{name, rows: (string|number|null)[][], widths?: number[]}] -> Uint8Array */
export function writeXlsx(sheets) {
  const files = {};
  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      `</Types>`,
  );
  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      `</sheets></workbook>`,
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  files["xl/styles.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf fillId="2" applyFill="1"/></cellXfs></styleSheet>`,
  );
  sheets.forEach((s, i) => {
    const cols = s.widths ? `<cols>${s.widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const rows = s.rows
      .map((row, r) => {
        const cells = row
          .map((v, c) => {
            if (v === null || v === undefined || v === "") return "";
            const ref = colName(c) + (r + 1);
            const style = r === 0 && s.header !== false ? ' s="1"' : "";
            if (typeof v === "number") return `<c r="${ref}"${style}><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
          })
          .join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");
    const freeze = s.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>`,
    );
  });
  return zipSync(files, { level: 6 });
}

/** Reads an .xlsx into [{name, rows: string[][]}]. Handles shared + inline strings. */
export function readXlsx(data) {
  const files = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
  const text = p => (files[p] ? strFromU8(files[p]) : "");
  const decode = s =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
  const shared = [];
  const sst = text("xl/sharedStrings.xml");
  for (const si of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(decode([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join("")));
  }
  const wb = text("xl/workbook.xml");
  const rels = text("xl/_rels/workbook.xml.rels");
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  for (const m of rels.matchAll(/<Relationship[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"/g)) relMap[m[2]] = m[1];
  const out = [];
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    let target = relMap[m[2]] || "";
    target = target.replace(/^\/?xl\//, "").replace(/^\//, "");
    const xml = text("xl/" + target);
    const rows = [];
    for (const rm of xml.matchAll(/<row[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rnum = Number((rm[0].match(/ r="(\d+)"/) || [])[1] || rows.length + 1);
      const row = [];
      for (const cm of (rm[1] || "").matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
        const t = (attrs.match(/t="([^"]+)"/) || [])[1];
        const inner = cm[2] || "";
        let v = "";
        if (t === "s") v = shared[Number((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1])] ?? "";
        else if (t === "inlineStr") v = decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(""));
        else v = decode((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] ?? "");
        const ci = ref ? colIndex(ref) : row.length;
        row[ci] = v;
      }
      rows[rnum - 1] = Array.from(row, x => x ?? "");
    }
    out.push({ name: decode(m[1]), rows: Array.from(rows, r => r ?? []) });
  }
  return out;
}
