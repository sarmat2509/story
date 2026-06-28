import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { GRAPHIC_NOVEL_PAGE_TEMPLATES } from '../domain/graphicNovel/pageTemplates';

const OUTPUT_DIR = '/tmp/wondertales-graphic-novel-templates';
const WIDTH = 384;
const HEIGHT = 512;
const CONTACT_COLUMNS = 4;
const CONTACT_GAP = 24;
const CONTACT_LABEL_HEIGHT = 38;

const PANEL_GUIDE_COLORS = [
  '#c5e1ff',
  '#ffd1bd',
  '#c7ebcf',
  '#dacaff',
  '#ffe89a',
  '#ffc7d8',
];

function panelRect(
  panel: { rect: { x: number; y: number; width: number; height: number } },
  index: number
): string {
  const x = panel.rect.x * WIDTH;
  const y = panel.rect.y * HEIGHT;
  const width = panel.rect.width * WIDTH;
  const height = panel.rect.height * HEIGHT;
  const fill = PANEL_GUIDE_COLORS[index % PANEL_GUIDE_COLORS.length];
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="#111" stroke-width="4"/>`;
}

function templateSvg(templateId: string, panels: Array<{ rect: { x: number; y: number; width: number; height: number } }>): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="100%" height="100%" fill="#fffaf0"/>
  ${panels.map(panelRect).join('\n')}
</svg>`;
}

function labeledContactSvg(templateId: string, pngDataUrl: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT + CONTACT_LABEL_HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT + CONTACT_LABEL_HEIGHT}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <image href="${pngDataUrl}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/>
    <text x="${WIDTH / 2}" y="${HEIGHT + 28}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#111">${templateId}</text>
  </svg>`;
}

async function renderTemplatePng(template: (typeof GRAPHIC_NOVEL_PAGE_TEMPLATES)[number]): Promise<Buffer> {
  return sharp(Buffer.from(templateSvg(template.id, template.panels)))
    .png()
    .toBuffer();
}

async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const rendered: Array<{ id: string; buffer: Buffer }> = [];

  for (const template of GRAPHIC_NOVEL_PAGE_TEMPLATES) {
    const buffer = await renderTemplatePng(template);
    rendered.push({ id: template.id, buffer });
    await fs.writeFile(path.join(OUTPUT_DIR, `${template.id}.png`), buffer);
  }

  const cellWidth = WIDTH;
  const cellHeight = HEIGHT + CONTACT_LABEL_HEIGHT;
  const rows = Math.ceil(rendered.length / CONTACT_COLUMNS);
  const contactWidth = CONTACT_COLUMNS * cellWidth + (CONTACT_COLUMNS + 1) * CONTACT_GAP;
  const contactHeight = rows * cellHeight + (rows + 1) * CONTACT_GAP;
  const composites = await Promise.all(
    rendered.map(async (item, index) => {
      const col = index % CONTACT_COLUMNS;
      const row = Math.floor(index / CONTACT_COLUMNS);
      const dataUrl = `data:image/png;base64,${item.buffer.toString('base64')}`;
      const labeled = await sharp(Buffer.from(labeledContactSvg(item.id, dataUrl)))
        .png()
        .toBuffer();
      return {
        input: labeled,
        left: CONTACT_GAP + col * (cellWidth + CONTACT_GAP),
        top: CONTACT_GAP + row * (cellHeight + CONTACT_GAP),
      };
    })
  );

  await sharp({
    create: {
      width: contactWidth,
      height: contactHeight,
      channels: 4,
      background: '#ffffff',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(OUTPUT_DIR, 'contact-sheet.png'));

  console.log(`Rendered ${rendered.length} templates to ${OUTPUT_DIR}`);
  console.log(`Contact sheet: ${path.join(OUTPUT_DIR, 'contact-sheet.png')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
