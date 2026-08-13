const fs = require('fs/promises');
const path = require('path');
const { pdfToWord } = require('../src/engines/pdfToWord/pdfToWord.engine');
const { analyzePdf } = require('../src/services/document/documentAnalyzer');

const fixtureDir = path.join(__dirname, 'fixtures');
const cases = [
  ['normal-english.pdf', false],
  ['normal-amharic.pdf', false],
  ['scanned-english.pdf', true],
  ['scanned-amharic.pdf', true]
];

(async () => {
  let failed = 0;
  for (const [file, expectOcr] of cases) {
    const input = path.join(fixtureDir, file);
    try {
      const analysis = await analyzePdf(input);
      if (analysis.requiresOcr !== expectOcr) {
        throw new Error(`expected requiresOcr=${expectOcr}, got ${analysis.requiresOcr}`);
      }
      const result = await pdfToWord(input);
      const stat = await fs.stat(result.outputPath);
      if (stat.size === 0) throw new Error('output DOCX is empty');
      console.log(`PASS ${file} | ${expectOcr ? 'OCR' : 'native'} | ${stat.size} bytes`);
      await fs.rm(result.outputDir, { recursive: true, force: true }).catch(() => {});
    } catch (err) {
      failed++;
      console.error(`FAIL ${file}: ${err.message}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
})();
