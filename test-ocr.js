const { createWorker } = require('tesseract.js');
const fs = require('fs');

(async () => {
  const imagePath = '/tmp/cropped_original.png';
  if (!fs.existsSync(imagePath)) {
    console.error('Image not found at', imagePath);
    process.exit(1);
  }

  const worker = await createWorker('eng', 1, {
    langPath: process.cwd(),
  });

  await worker.setParameters({
    tessedit_pageseg_mode: '6',
    preserve_interword_spaces: '1',
    tessedit_char_whitelist: '0123456789+-*/=()',
  });

  const { data } = await worker.recognize(imagePath);
  console.log('Recognized text:', data.text);
  console.log('Words:', data.words?.length || 0);
  console.log('Blocks:', data.blocks?.length || 0);
  console.log('LayoutBlocks:', data.layoutBlocks?.length || 0);

  await worker.terminate();
})();