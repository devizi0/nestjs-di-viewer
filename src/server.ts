import express from 'express';
import * as http from 'http';
import { DiGraph } from './parser';

const HTML = (graph: DiGraph): string => {
  const data = JSON.stringify(graph);

  // Mermaid 다이어그램 생성 — 루트(AppModule) 관련 엣지를 맨 앞에 배치
  const circularSet = new Set(graph.circular.map(c => c.from + '→' + c.to));
  const rootMod = graph.modules.find(m => m.name === 'AppModule') || graph.modules[0];
  const rootEdges = graph.edges.filter(e => e.to === rootMod.name);
  const otherEdges = graph.edges.filter(e => e.to !== rootMod.name);
  const sortedEdges = [...rootEdges, ...otherEdges];
  const lines: string[] = ['graph LR'];
  sortedEdges.forEach(e => {
    const arrow = circularSet.has(e.from + '→' + e.to) ? '-. circular .->' : '-->';
    lines.push(`  ${e.from}${arrow}${e.to}`);
  });
  const mermaidDef = lines.join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>NestJS DI Viewer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; color: #ccc; font-family: 'Roboto', sans-serif; display: flex; height: 100vh; overflow: hidden; }

    #sidebar {
      width: 260px; min-width: 260px; background: #1a1a1a; border-right: 1px solid #333;
      display: flex; flex-direction: column; overflow: hidden;
    }
    #sidebar h1 { padding: 14px 16px; font-size: 0.85rem; color: #aaa; border-bottom: 1px solid #333; letter-spacing: 0.04em; font-weight: 400; }
    #module-list { overflow-y: auto; flex: 1; }
    .module-item {
      padding: 8px 16px; cursor: pointer; border-bottom: 1px solid #222;
      font-size: 0.8rem; transition: background 0.1s; color: #bbb;
    }
    .module-item:hover { background: #2a2a2a; }
    .module-item.selected { background: #1e2a3a; color: #6699cc; border-left: 2px solid #4477aa; }
    .module-item.circular { color: #cc4444; }
    .module-item.orphan { color: #cc8844; }

    .badge { display: inline-block; padding: 1px 5px; border-radius: 2px; font-size: 0.68rem; margin-left: 4px; }
    .badge-circular { background: #7a1a1a; color: #ffaaaa; }
    .badge-orphan { background: #3a2200; color: #cc8844; }

    /* 플로팅 디테일 패널 */
    #detail-panel {
      display: none; position: absolute; top: 52px; left: 16px;
      width: 250px; background: #1a1a1a; border: 1px solid #444;
      box-shadow: 2px 2px 8px rgba(0,0,0,0.8);
      font-size: 0.77rem; z-index: 100; overflow: hidden;
      animation: fadeIn 0.12s ease;
    }
    #detail-panel.visible { display: block; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
    #detail-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; background: #222; border-bottom: 1px solid #333;
    }
    #detail-panel-header h2 { color: #6699cc; font-size: 0.82rem; font-weight: 400; }
    #detail-panel-close {
      cursor: pointer; color: #666; font-size: 0.95rem; line-height: 1;
      background: none; border: none; padding: 0 2px;
    }
    #detail-panel-close:hover { color: #cc4444; background: none; }
    #detail-panel-body { padding: 10px 12px; max-height: 340px; overflow-y: auto; }
    .detail-section { margin-bottom: 10px; }
    .detail-section h3 {
      color: #888; font-size: 0.7rem; font-weight: 400; letter-spacing: 0.08em;
      text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #2a2a2a; padding-bottom: 2px;
    }
    .detail-section .item {
      color: #bbb; padding: 2px 6px; margin-bottom: 2px;
      background: #222; font-size: 0.73rem; border-left: 2px solid #333;
    }

    #graph { flex: 1; position: relative; overflow: auto; display: flex; align-items: flex-start; justify-content: center; padding: 24px; }
    .mermaid { width: 100%; }
    .mermaid svg { width: 100% !important; height: auto !important; min-height: calc(100vh - 48px); }
    .mermaid svg .node.selected-node rect,
    .mermaid svg .node.selected-node polygon,
    .mermaid svg .node.selected-node circle { fill: #1e3a5f !important; stroke: #6699cc !important; stroke-width: 2.5px !important; }

    #controls {
      position: absolute; top: 14px; right: 14px; display: flex; gap: 6px; z-index: 10;
    }
    button {
      background: #222; border: 1px solid #444; color: #bbb;
      padding: 5px 10px; border-radius: 2px; cursor: pointer; font-size: 0.75rem; font-family: 'Roboto', sans-serif;
    }
    button:hover { background: #2a2a2a; color: #ddd; }
    select {
      background: #222; border: 1px solid #444; color: #bbb;
      padding: 5px 8px; border-radius: 2px; cursor: pointer; font-size: 0.75rem; font-family: 'Roboto', sans-serif;
    }

    #legend {
      position: absolute; bottom: 16px; right: 16px; background: #1a1a1a;
      border: 1px solid #333; padding: 8px 12px; font-size: 0.72rem;
    }
    .legend-item { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; color: #999; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
  </style>
</head>
<body>
  <div id="sidebar">
    <h1>NestJS DI Viewer</h1>
    <div id="module-list"></div>
  </div>
  <div id="graph">
    <div id="controls">
      <select onchange="changeLang(this.value)">
        <option value="en">English</option>
        <option value="ko">한국어</option>
        <option value="ja">日本語</option>
        <option value="zh">中文</option>
        <option value="es">Español</option>
      </select>
    </div>
    <div id="detail-panel">
      <div id="detail-panel-header">
        <h2 id="detail-panel-title"></h2>
        <button id="detail-panel-close" onclick="closeDetail()">&#x2715;</button>
      </div>
      <div id="detail-panel-body"></div>
    </div>
    <div class="mermaid">${mermaidDef}</div>
    <div id="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#334;border:1px solid #6699cc"></div><span id="legend-module">Module</span></div>
      <div class="legend-item"><div class="legend-dot" style="background:#3a0a0a;border:1px solid #cc4444"></div><span id="legend-circular">Circular</span></div>
      <div class="legend-item"><div class="legend-dot" style="background:#2a1a00;border:1px dashed #cc8844"></div><span id="legend-orphan">Orphan</span></div>
    </div>
  </div>

  <script>
    const graph = ${data};

    const i18n = {
      en: { circular:'circular', orphan:'orphan', legend_module:'Module', legend_circular:'Circular', legend_orphan:'Orphan', depth_label:'depth' },
      ko: { circular:'순환', orphan:'고아', legend_module:'모듈', legend_circular:'순환 의존', legend_orphan:'고아 모듈', depth_label:'깊이' },
      ja: { circular:'循環', orphan:'孤立', legend_module:'モジュール', legend_circular:'循環依存', legend_orphan:'孤立モジュール', depth_label:'深さ' },
      zh: { circular:'循环', orphan:'孤立', legend_module:'模块', legend_circular:'循环依赖', legend_orphan:'孤立模块', depth_label:'深度' },
      es: { circular:'circular', orphan:'huérfano', legend_module:'Módulo', legend_circular:'Dep. circular', legend_orphan:'Módulo huérfano', depth_label:'profundidad' },
    };
    let lang = 'en';
    function t(k) { return i18n[lang][k] ?? k; }
    function changeLang(v) { lang = v; applyLang(); }
    function applyLang() {
      document.getElementById('legend-module').textContent = t('legend_module');
      document.getElementById('legend-circular').textContent = t('legend_circular');
      document.getElementById('legend-orphan').textContent = t('legend_orphan');
      document.querySelectorAll('.badge-circular').forEach(el => el.textContent = t('circular'));
      document.querySelectorAll('.badge-orphan').forEach(el => el.textContent = t('orphan'));
      if (selectedModule) selectModule(selectedModule);
    }

    // 분석
    const circularNodes = new Set(graph.circular.flatMap(c => [c.from, c.to]));
    const rootName = (graph.modules.find(m => m.name === 'AppModule') || graph.modules[0]).name;
    const radj = new Map();
    graph.modules.forEach(m => radj.set(m.name, []));
    graph.edges.forEach(e => { if (radj.has(e.to)) radj.get(e.to).push(e.from); });
    const depthMap = new Map();
    const bfsQueue = [rootName]; depthMap.set(rootName, 0);
    while (bfsQueue.length) {
      const cur = bfsQueue.shift();
      for (const nb of radj.get(cur) ?? []) {
        if (!depthMap.has(nb)) { depthMap.set(nb, depthMap.get(cur) + 1); bfsQueue.push(nb); }
      }
    }
    const importerSet = new Set(graph.edges.map(e => e.from));
    const orphanNodes = new Set(graph.modules.map(m => m.name).filter(n => !importerSet.has(n) && n !== rootName));

    let selectedModule = null;

    // 사이드바
    const list = document.getElementById('module-list');
    [...graph.modules].sort((a,b) => a.name.localeCompare(b.name)).forEach(mod => {
      const el = document.createElement('div');
      let cls = 'module-item';
      if (circularNodes.has(mod.name)) cls += ' circular';
      if (orphanNodes.has(mod.name))   cls += ' orphan';
      el.className = cls;
      el.textContent = mod.name;
      if (circularNodes.has(mod.name)) {
        const b = document.createElement('span'); b.className = 'badge badge-circular'; b.textContent = t('circular'); el.appendChild(b);
      }
      if (orphanNodes.has(mod.name)) {
        const b = document.createElement('span'); b.className = 'badge badge-orphan'; b.textContent = t('orphan'); el.appendChild(b);
      }
      el.onclick = () => { if (selectedModule === mod.name) closeDetail(); else selectModule(mod.name); };
      el.id = 'item-' + mod.name;
      list.appendChild(el);
    });

    // Mermaid 초기화
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      securityLevel: 'loose',
      flowchart: { nodeSpacing: 60, rankSpacing: 80, padding: 20 },
      fontSize: 18,
    });

    // Mermaid 렌더 후 노드 클릭 이벤트 바인딩
    window.addEventListener('load', () => {
      setTimeout(() => {
        document.querySelectorAll('.mermaid svg .node').forEach(el => {
          const label = el.querySelector('.label, text, span');
          if (!label) return;
          const name = label.textContent?.trim().replace(/\\n/g, '');
          if (!name) return;
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => {
            const mod = graph.modules.find(m => m.name === name);
            if (!mod) return;
            if (selectedModule === name) { closeDetail(); return; }
            // 이전 선택 노드 색 초기화
            document.querySelectorAll('.mermaid svg .node.selected-node')
              .forEach(n => n.classList.remove('selected-node'));
            el.classList.add('selected-node');
            selectModule(name);
          });
        });
      }, 800);
    });

    function closeDetail() {
      document.getElementById('detail-panel').classList.remove('visible');
      selectedModule = null;
      document.querySelectorAll('.module-item').forEach(el => el.classList.remove('selected'));
      document.querySelectorAll('.mermaid svg .node.selected-node').forEach(n => n.classList.remove('selected-node'));
    }

    function selectModule(name) {
      selectedModule = name;
      const mod = graph.modules.find(m => m.name === name);
      if (!mod) return;

      document.querySelectorAll('.module-item').forEach(el => el.classList.remove('selected'));
      const el = document.getElementById('item-' + name);
      if (el) { el.classList.add('selected'); el.scrollIntoView({ block: 'nearest' }); }

      const depth = depthMap.has(name) ? depthMap.get(name) : '?';
      const badges = [
        circularNodes.has(name) ? \`<span class="badge badge-circular">\${t('circular')}</span>\` : '',
        orphanNodes.has(name)   ? \`<span class="badge badge-orphan">\${t('orphan')}</span>\` : '',
        \`<span style="font-size:0.7rem;color:#555;margin-left:6px">\${t('depth_label')} \${depth}</span>\`,
      ].join('');
      document.getElementById('detail-panel-title').innerHTML = name + badges;

      const sections = [
        { title: 'Imports',     items: mod.imports },
        { title: 'Providers',   items: mod.providers },
        { title: 'Controllers', items: mod.controllers },
        { title: 'Exports',     items: mod.exports },
      ].filter(s => s.items.length > 0);

      document.getElementById('detail-panel-body').innerHTML = sections.map(s => \`
        <div class="detail-section">
          <h3>\${s.title} (\${s.items.length})</h3>
          \${s.items.map(i => \`<div class="item">\${i}</div>\`).join('')}
        </div>\`).join('');
      document.getElementById('detail-panel').classList.add('visible');
    }
  </script>
</body>
</html>`;
};

export function buildExportHTML(graph: DiGraph): string {
  const circularSet = new Set(graph.circular.map(c => c.from + '→' + c.to));
  const rootMod = graph.modules.find(m => m.name === 'AppModule') || graph.modules[0];
  const rootEdges = graph.edges.filter(e => e.to === rootMod.name);
  const otherEdges = graph.edges.filter(e => e.to !== rootMod.name);
  const lines: string[] = ['graph LR'];
  [...rootEdges, ...otherEdges].forEach(e => {
    const arrow = circularSet.has(e.from + '→' + e.to) ? '-. circular .->' : '-->';
    lines.push(`  ${e.from}${arrow}${e.to}`);
  });
  const mermaidDef = lines.join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>NestJS DI Viewer</title>
  <script src="./mermaid.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .mermaid { padding: 24px; }
    .mermaid svg { width: auto !important; height: auto !important; max-width: 100%; }
    #legend {
      position: fixed; bottom: 16px; right: 16px; background: #1a1a1a;
      border: 1px solid #333; padding: 8px 12px; font-size: 0.72rem; font-family: sans-serif;
    }
    .legend-item { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; color: #999; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
  </style>
</head>
<body>
  <div class="mermaid">${mermaidDef}</div>
  <div id="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#334;border:1px solid #6699cc"></div><span>Module</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:#3a0a0a;border:1px solid #cc4444"></div><span>Circular</span></div>
    <div class="legend-item"><div class="legend-dot" style="background:#2a1a00;border:1px dashed #cc8844"></div><span>Orphan</span></div>
  </div>
  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', flowchart: { nodeSpacing: 60, rankSpacing: 80 } });
    document.addEventListener('DOMContentLoaded', async () => {
      await mermaid.run({ querySelector: '.mermaid' });
    });
  </script>
</body>
</html>`;
}

export function startServer(graph: DiGraph, port = 3333): Promise<http.Server> {
  return new Promise((resolve) => {
    const app = express();
    app.get('/', (_, res) => res.send(HTML(graph)));
    const server = app.listen(port, () => resolve(server));
  });
}
