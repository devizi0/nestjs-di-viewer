#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import { parseModules } from './parser';
import { startServer } from './server';
import { exportPng } from './export';

const program = new Command();

program
  .name('nestjs-di-viewer')
  .description('NestJS DI 의존성 그래프 시각화 도구')
  .version('1.0.0')
  .argument('<entry>', 'AppModule 파일 경로 (예: src/app.module.ts)')
  .option('-p, --port <number>', '포트 번호', '3333')
  .option('--no-open', '브라우저 자동 오픈 비활성화')
  .option('--export <path>', 'PNG로 내보내기 (예: ./di-graph.png)')
  .action(async (entry: string, opts: { port: string; open: boolean; export?: string }) => {
    const entryPath = path.resolve(process.cwd(), entry);
    const port = parseInt(opts.port, 10);

    console.log(`\nAnalyzing: ${entryPath}`);

    const graph = parseModules(entryPath);

    console.log(`Found ${graph.modules.length} modules / ${graph.edges.length} edges`);
    if (graph.circular.length > 0) {
      console.warn(`Circular dependency detected: ${graph.circular.map((c) => `${c.from} <-> ${c.to}`).join(', ')}`);
    }

    if (opts.export) {
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
