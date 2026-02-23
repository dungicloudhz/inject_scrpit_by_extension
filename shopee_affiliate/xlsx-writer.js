/**
 * xlsx-writer.js - Self-contained XLSX file generator
 * Tạo file .xlsx mà không cần thư viện bên ngoài (SheetJS)
 * Sử dụng ZIP format (store method) + Office Open XML
 */

(function (global) {
  'use strict';

  // === CRC32 ===
  const CRC32_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC32_TABLE[i] = c;
  }

  function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // === STRING TO UTF-8 BYTES ===
  function strToBytes(str) {
    return new TextEncoder().encode(str);
  }

  // === MINIMAL ZIP WRITER (store method, no compression) ===
  class ZipWriter {
    constructor() {
      this.files = [];
      this.offset = 0;
    }

    addFile(name, content) {
      const nameBytes = strToBytes(name);
      const contentBytes = typeof content === 'string' ? strToBytes(content) : content;
      const fileCrc = crc32(contentBytes);

      this.files.push({
        name: nameBytes,
        content: contentBytes,
        crc: fileCrc,
        offset: this.offset
      });

      // Local file header (30 bytes) + name + content
      this.offset += 30 + nameBytes.length + contentBytes.length;
    }

    generate() {
      const parts = [];

      // === Local file headers + data ===
      for (const file of this.files) {
        const header = new ArrayBuffer(30);
        const v = new DataView(header);

        v.setUint32(0, 0x04034b50, true);           // Signature
        v.setUint16(4, 20, true);                     // Version needed (2.0)
        v.setUint16(6, 0x0800, true);                 // Flags: UTF-8
        v.setUint16(8, 0, true);                      // Compression: store
        v.setUint16(10, 0, true);                     // Mod time
        v.setUint16(12, 0x0021, true);                // Mod date (valid date)
        v.setUint32(14, file.crc, true);              // CRC-32
        v.setUint32(18, file.content.length, true);   // Compressed size
        v.setUint32(22, file.content.length, true);   // Uncompressed size
        v.setUint16(26, file.name.length, true);      // File name length
        v.setUint16(28, 0, true);                     // Extra field length

        parts.push(new Uint8Array(header));
        parts.push(file.name);
        parts.push(file.content);
      }

      // === Central directory ===
      const centralDirOffset = this.offset;
      let centralDirSize = 0;

      for (const file of this.files) {
        const cdHeader = new ArrayBuffer(46);
        const v = new DataView(cdHeader);

        v.setUint32(0, 0x02014b50, true);            // Signature
        v.setUint16(4, 20, true);                     // Version made by
        v.setUint16(6, 20, true);                     // Version needed
        v.setUint16(8, 0x0800, true);                 // Flags: UTF-8
        v.setUint16(10, 0, true);                     // Compression: store
        v.setUint16(12, 0, true);                     // Mod time
        v.setUint16(14, 0x0021, true);                // Mod date
        v.setUint32(16, file.crc, true);              // CRC-32
        v.setUint32(20, file.content.length, true);   // Compressed size
        v.setUint32(24, file.content.length, true);   // Uncompressed size
        v.setUint16(28, file.name.length, true);      // File name length
        v.setUint16(30, 0, true);                     // Extra field length
        v.setUint16(32, 0, true);                     // Comment length
        v.setUint16(34, 0, true);                     // Disk number start
        v.setUint16(36, 0, true);                     // Internal attributes
        v.setUint32(38, 0, true);                     // External attributes
        v.setUint32(42, file.offset, true);           // Local header offset

        parts.push(new Uint8Array(cdHeader));
        parts.push(file.name);
        centralDirSize += 46 + file.name.length;
      }

      // === End of central directory ===
      const eocd = new ArrayBuffer(22);
      const ev = new DataView(eocd);

      ev.setUint32(0, 0x06054b50, true);              // Signature
      ev.setUint16(4, 0, true);                       // Disk number
      ev.setUint16(6, 0, true);                       // Disk with central dir
      ev.setUint16(8, this.files.length, true);       // Entries on this disk
      ev.setUint16(10, this.files.length, true);      // Total entries
      ev.setUint32(12, centralDirSize, true);         // Central dir size
      ev.setUint32(16, centralDirOffset, true);       // Central dir offset
      ev.setUint16(20, 0, true);                      // Comment length

      parts.push(new Uint8Array(eocd));

      // Combine all parts into one Uint8Array
      const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
      const result = new Uint8Array(totalLen);
      let pos = 0;
      for (const part of parts) {
        result.set(part, pos);
        pos += part.length;
      }

      return result;
    }
  }

  // === XML HELPERS ===

  function escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Column index (0-based) to Excel column letter (A, B, ... Z, AA, AB, ...)
  function colLetter(col) {
    let letter = '';
    col++;
    while (col > 0) {
      col--;
      letter = String.fromCharCode(65 + (col % 26)) + letter;
      col = Math.floor(col / 26);
    }
    return letter;
  }

  // === GENERATE XLSX ===

  /**
   * Tạo file XLSX từ headers và rows
   * @param {string[]} headers - Mảng tên cột
   * @param {Array[]} rows - Mảng các hàng dữ liệu
   * @param {string} sheetName - Tên sheet
   * @returns {Uint8Array} - Binary XLSX data
   */
  function generateXLSX(headers, rows, sheetName) {
    sheetName = sheetName || 'Sheet1';
    const zip = new ZipWriter();

    // [Content_Types].xml
    zip.addFile('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>'
    );

    // _rels/.rels
    zip.addFile('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
    );

    // xl/workbook.xml
    zip.addFile('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="' + escapeXml(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>'
    );

    // xl/_rels/workbook.xml.rels
    zip.addFile('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>'
    );

    // xl/styles.xml - Header row bold, number format for VND
    zip.addFile('xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>' +
      '<fonts count="2">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>' +
      '</fonts>' +
      '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFEE4D2D"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '</cellXfs>' +
      '</styleSheet>'
    );

    // xl/worksheets/sheet1.xml - Actual data
    let sheetData = '';

    // Header row (style s="1" = bold white on Shopee orange)
    sheetData += '<row r="1">';
    headers.forEach(function (h, i) {
      var ref = colLetter(i) + '1';
      sheetData += '<c r="' + ref + '" t="inlineStr" s="1"><is><t>' + escapeXml(h) + '</t></is></c>';
    });
    sheetData += '</row>';

    // Data rows
    rows.forEach(function (row, rowIdx) {
      var rowNum = rowIdx + 2;
      sheetData += '<row r="' + rowNum + '">';
      row.forEach(function (cell, colIdx) {
        var ref = colLetter(colIdx) + rowNum;
        if (typeof cell === 'number' && !isNaN(cell)) {
          // Number cells: use number format for price/commission columns (index 3,4,5,6)
          var style = (colIdx >= 3) ? ' s="2"' : '';
          sheetData += '<c r="' + ref + '"' + style + '><v>' + cell + '</v></c>';
        } else {
          sheetData += '<c r="' + ref + '" t="inlineStr"><is><t>' + escapeXml(String(cell || '')) + '</t></is></c>';
        }
      });
      sheetData += '</row>';
    });

    var lastCol = colLetter(headers.length - 1);
    var lastRow = rows.length + 1;

    // Column widths for better readability
    var colsXml = '<cols>';
    var colWidths = [6, 50, 25, 15, 15, 12, 15, 40]; // STT, Name, Shop, Price, Commission, %, Sales, URL
    colWidths.forEach(function (w, i) {
      colsXml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
    });
    colsXml += '</cols>';

    zip.addFile('xl/worksheets/sheet1.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<dimension ref="A1:' + lastCol + lastRow + '"/>' +
      colsXml +
      '<sheetData>' + sheetData + '</sheetData>' +
      '</worksheet>'
    );

    return zip.generate();
  }

  // Export to global scope
  global.XLSXWriter = { generateXLSX: generateXLSX };

})(typeof window !== 'undefined' ? window : this);
