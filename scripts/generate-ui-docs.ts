import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';

const SCREENSHOTS_DIR = join(process.cwd(), 'docs', 'screenshots');
const OUTPUT_FILE = join(process.cwd(), 'docs', 'ui-reference.md');

interface ScreenshotMeta {
  name: string;
  caption: string;
  section: string;
  timestamp: string;
}

function main() {
  if (!existsSync(SCREENSHOTS_DIR)) {
    console.error('No screenshots found. Run: DOCS_MODE=true npm run test:smoke');
    process.exit(1);
  }

  const jsonFiles = readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.json'));
  const screenshots: ScreenshotMeta[] = jsonFiles.map(f => {
    return JSON.parse(readFileSync(join(SCREENSHOTS_DIR, f), 'utf8')) as ScreenshotMeta;
  });

  // Group by section
  const sections = new Map<string, ScreenshotMeta[]>();
  for (const s of screenshots) {
    if (!sections.has(s.section)) sections.set(s.section, []);
    sections.get(s.section)!.push(s);
  }

  const lines: string[] = [
    '# Loom UI Reference',
    '',
    `_Generated ${new Date().toLocaleDateString()} from smoke test screenshots._`,
    '',
  ];

  for (const [section, items] of sections) {
    lines.push(`## ${section}`, '');
    for (const item of items) {
      const imgPath = relative(join(process.cwd(), 'docs'), join(SCREENSHOTS_DIR, `${item.name}.png`));
      lines.push(`### ${item.caption}`, '', `![${item.caption}](${imgPath})`, '');
    }
  }

  writeFileSync(OUTPUT_FILE, lines.join('\n'));
  console.log(`✅ Generated ${OUTPUT_FILE} with ${screenshots.length} screenshots`);
}

main();
