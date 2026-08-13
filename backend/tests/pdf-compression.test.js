const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { compressPdf } = require('../src/engines/compression/compression.engine');

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 120000, ...options }, (error, stdout, stderr) => {
      if (error) return reject(Object.assign(error, { stderr }));
      resolve({ stdout, stderr });
    });
  });
}

async function makeFixtures(dir) {
  const py = `
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
import os

text_path = os.path.join(${JSON.stringify(dir)}, 'text.pdf')
c = canvas.Canvas(text_path, pagesize=A4)
for p in range(8):
    c.setFont('Helvetica', 11)
    for i in range(45):
        c.drawString(45, 800 - i*16, f'Compression test page {p+1} line {i+1}: The quick brown fox jumps over the lazy dog.')
    c.showPage()
c.save()

img_path = os.path.join(${JSON.stringify(dir)}, 'large.png')
im = Image.new('RGB', (1600, 2200), 'white')
d = ImageDraw.Draw(im)
for y in range(0, 2200, 20):
    d.line((0,y,1600,y), fill=(120,120,120), width=2)
for x in range(0, 1600, 20):
    d.line((x,0,x,2200), fill=(180,180,180), width=2)
im.save(img_path, quality=95)
img_pdf = os.path.join(${JSON.stringify(dir)}, 'image.pdf')
c = canvas.Canvas(img_pdf, pagesize=A4)
c.drawImage(ImageReader(img_path), 0, 0, width=A4[0], height=A4[1])
c.showPage(); c.save()
`;
  const script = path.join(dir, 'make.py');
  await fs.writeFile(script, py);
  await execFileAsync('python3', [script]);
  return { text: path.join(dir, 'text.pdf'), image: path.join(dir, 'image.pdf') };
}

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aio-compress-test-'));
  try {
    const fixtures = await makeFixtures(dir);
    for (const [name, input] of Object.entries(fixtures)) {
      const inputStat = await fs.stat(input);
      const result = await compressPdf(input, { level: 'medium' });
      const outStat = await fs.stat(result.outputPath);
      assert(outStat.size > 0, `${name}: output must be non-empty`);
      assert.equal(result.originalSizeBytes, inputStat.size, `${name}: original size mismatch`);
      assert.equal(result.outputSizeBytes, outStat.size, `${name}: output size mismatch`);
      assert(result.analysis && result.analysis.type === 'pdf', `${name}: PDF analysis missing`);
      await execFileAsync('pdfinfo', [result.outputPath]);
      assert.equal(typeof result.wasShrunk, 'boolean');
      assert(result.reductionPercent >= 0 && result.reductionPercent <= 100);
      await fs.rm(result.outputDir, { recursive: true, force: true });
    }

    const bad = path.join(dir, 'bad.pdf');
    await fs.writeFile(bad, 'not a pdf');
    await assert.rejects(() => compressPdf(bad), /valid PDF|Invalid|compression failed/i);

    console.log('PDF COMPRESSION TESTS: PASS');
    console.log('Text PDF: PASS');
    console.log('Image PDF: PASS');
    console.log('Invalid PDF rejection: PASS');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch((err) => {
  console.error('PDF COMPRESSION TESTS: FAIL');
  console.error(err.stack || err);
  process.exit(1);
});
