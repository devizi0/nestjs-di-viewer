#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { parseModules } from './parser';
import { startServer, buildMermaidDef } from './server';
import { exportPng } from './export';

function resolveEntry(entry?: string): string {
  if (entry) return path.resolve(process.cwd(), entry);

  const cwd = process.cwd();
  const candidates: string[] = [];

  // package.json main 필드 기반
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const main = pkg.main as string | undefined;
      if (main) {
        const base = main.replace(/\.(js|d\.ts)$/, '.ts').replace(/^dist\//, 'src/');
        const guessed = path.join(cwd, base.replace(/[^/]+\.ts$/, 'app.module.ts'));
        candidates.push(guessed);
      }
    } catch {}
  }

  // 일반적인 경로 후보
  candidates.push(
    path.join(cwd, 'src/app.module.ts'),
    path.join(cwd, 'src/main.ts'),
    path.join(cwd, 'app.module.ts'),
  );

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  console.error('Could not find entry file. Please specify it explicitly: nestjs-di-viewer <entry>');
  process.exit(1);
}

const program = new Command();

program
  .name('nestjs-di-viewer')
  .description('NestJS DI 의존성 그래프 시각화 도구')
  .version('1.0.0')
  .argument('[entry]', 'AppModule 파일 경로 (생략 시 자동 탐색)')
  .option('-p, --port <number>', '포트 번호', '3333')
  .option('--no-open', '브라우저 자동 오픈 비활성화')
  .option('--export <path>', 'PNG로 내보내기 (예: ./di-graph.png)')
  .option('--diagram', 'Mermaid 다이어그램 텍스트 출력 후 종료')
  .action(async (entry: string | undefined, opts: { port: string; open: boolean; export?: string; diagram?: boolean }) => {
    const entryPath = resolveEntry(entry);
    const port = parseInt(opts.port, 10);

    console.log(`\nAnalyzing: ${entryPath}`);

    const graph = parseModules(entryPath);

    console.log(`Found ${graph.modules.length} modules / ${graph.edges.length} edges`);
    if (graph.circular.length > 0) {
      console.warn(`Circular dependency detected: ${graph.circular.map((c) => `${c.from} <-> ${c.to}`).join(', ')}`);
    }

    if (opts.diagram) {
      process.stdout.write(buildMermaidDef(graph) + '\n');
    } else if (opts.export) {
      console.log(`Exporting PNG...`);
      await exportPng(graph, opts.export);
    } else {
      await startServer(graph, port);
      console.log(`Server running at http://localhost:${port}\n`);
      if (opts.open) {
        const open = (await import('open')).default;
        await open(`http://localhost:${port}`);
      }
    }
  });

program.parse();
