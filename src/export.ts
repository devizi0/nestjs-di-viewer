import puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DiGraph } from './parser';
import { buildExportHTML } from './server';

export async function exportPng(graph: DiGraph, outputPath: string): Promise<void> {
  const mermaidSrc = path.join(__dirname, '../node_modules/mermaid/dist/mermaid.min.js');
  const tmpDir = path.join(os.tmpdir(), `nestjs-di-viewer-${Date.now()}`);
  fs.mkdirSync(tmpDir);
  const tmpMermaid = path.join(tmpDir, 'mermaid.min.js');
  fs.copyFileSync(mermaidSrc, tmpMermaid);

  const html = buildExportHTML(graph);
  const tmpFile = path.join(tmpDir, 'index.html');
  fs.writeFileSync(tmpFile, html, 'utf-8');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--allow-file-access-from-files', '--disable-web-security'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  await page.goto(`file://${tmpFile}`, { waitUntil: 'networkidle0' });

  // Mermaid SVG 렌더링 완료 대기 (viewBox 기준)
  await page.waitForFunction(
    '!!document.querySelector(".mermaid svg[viewBox]")',
    { timeout: 15000 }
  );

  // SVG에 viewBox 기반 명시적 크기 부여 후 fullPage 스크린샷
  const PAD = 48;
  await page.evaluate(`(() => {
    const svg = document.querySelector('.mermaid svg');
    const vb = svg.getAttribute('viewBox').split(' ');
    const w = Math.ceil(parseFloat(vb[2]));
    const h = Math.ceil(parseFloat(vb[3]));
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    document.body.style.margin = '0';
    document.body.style.padding = '${PAD}px';
    document.body.style.width = (w + ${PAD} * 2) + 'px';
    document.body.style.height = (h + ${PAD} * 2) + 'px';
    document.body.style.display = 'flex';
    document.body.style.alignItems = 'center';
    document.body.style.justifyContent = 'center';
  })()`);
  await page.setViewport({
    width: await page.evaluate(`Math.ceil(parseFloat(document.querySelector('.mermaid svg').getAttribute('viewBox').split(' ')[2])) + ${PAD * 2}`) as number,
    height: await page.evaluate(`Math.ceil(parseFloat(document.querySelector('.mermaid svg').getAttribute('viewBox').split(' ')[3])) + ${PAD * 2}`) as number,
  });

  const abs = path.resolve(outputPath);
  await page.screenshot({ path: abs as `${string}.png`, fullPage: false });
  await browser.close();

  fs.rmSync(tmpDir, { recursive: true });
  console.log(`PNG exported: ${abs}`);
}
