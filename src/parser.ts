import { Project, SyntaxKind, ObjectLiteralExpression, ArrayLiteralExpression, CallExpression } from 'ts-morph';
import * as path from 'path';

export interface DynamicModuleConfig {
  method: string;        // 'forRoot' | 'forFeature' | 'register' | etc.
  isGlobal: boolean;
  args: string[];        // 첫 번째 인자들을 텍스트로 보존
}

export interface ImportedModule {
  name: string;
  dynamic?: DynamicModuleConfig;
}

export interface ModuleNode {
  id: string;            // filePath + '#' + name (unique key)
  name: string;
  filePath: string;
  imports: ImportedModule[];
  providers: string[];
  controllers: string[];
  exports: string[];
}

export interface DiGraph {
  modules: ModuleNode[];
  edges: Array<{ from: string; to: string }>;   // id 기반
  circular: Array<{ from: string; to: string }>; // id 기반
}

// ---- helpers ----------------------------------------------------------------

function parseDynamicConfig(call: CallExpression): DynamicModuleConfig {
  const expr = call.getExpression();
  const method =
    expr.getKind() === SyntaxKind.PropertyAccessExpression
      ? expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName()
      : expr.getText();

  const rawArgs = call.getArguments().map((a) => a.getText());

  // isGlobal: 첫 번째 객체 인자에 isGlobal: true 가 있으면 true
  let isGlobal = false;
  for (const arg of call.getArguments()) {
    if (arg.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const obj = arg.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const globalProp = obj.getProperty('isGlobal');
      if (globalProp) {
        const init = globalProp.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
        isGlobal = init?.getText() === 'true';
      }
    }
  }

  return { method, isGlobal, args: rawArgs };
}

function extractImportItems(arr: ArrayLiteralExpression): ImportedModule[] {
  return arr.getElements().map((el): ImportedModule => {
    // SomeModule.forRoot(...) / SomeModule.forFeature(...)
    if (el.getKind() === SyntaxKind.CallExpression) {
      const call = el.asKindOrThrow(SyntaxKind.CallExpression);
      const expr = call.getExpression();
      const name =
        expr.getKind() === SyntaxKind.PropertyAccessExpression
          ? expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getExpression().getText()
          : expr.getText();
      return { name, dynamic: parseDynamicConfig(call) };
    }

    // { provide: X, useClass: Y } 등 객체 형태 (imports 배열에서는 드물지만 대응)
    if (el.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const obj = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const useClass = obj.getProperty('useClass');
      const useExisting = obj.getProperty('useExisting');
      const provide = obj.getProperty('provide');
      if (useClass) return { name: useClass.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()!.getText() };
      if (useExisting) return { name: useExisting.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()!.getText() };
      if (provide) return { name: provide.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()!.getText().replace(/['"`]/g, '') };
      return { name: el.getText() };
    }

    return { name: el.getText().replace(/['"`]/g, '') };
  });
}

function extractStringArray(arr: ArrayLiteralExpression): string[] {
  return arr.getElements().map((el) => {
    if (el.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const obj = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
      const useClass = obj.getProperty('useClass');
      const useExisting = obj.getProperty('useExisting');
      const provide = obj.getProperty('provide');
      if (useClass) return useClass.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()!.getText();
      if (useExisting) return useExisting.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()!.getText();
      if (provide) return provide.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer()!.getText().replace(/['"`]/g, '');
      return el.getText();
    }
    if (el.getKind() === SyntaxKind.CallExpression) {
      const expr = el.asKindOrThrow(SyntaxKind.CallExpression).getExpression();
      if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
        return expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getExpression().getText();
      }
      return expr.getText();
    }
    return el.getText().replace(/['"`]/g, '');
  });
}

function getModuleImports(objLiteral: ObjectLiteralExpression): ImportedModule[] {
  const prop = objLiteral.getProperty('imports');
  if (!prop) return [];
  const initializer = prop.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
  if (!initializer || initializer.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  return extractImportItems(initializer.asKindOrThrow(SyntaxKind.ArrayLiteralExpression));
}

function getModuleMetadata(objLiteral: ObjectLiteralExpression, key: string): string[] {
  const prop = objLiteral.getProperty(key);
  if (!prop) return [];
  const initializer = prop.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
  if (!initializer || initializer.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  return extractStringArray(initializer.asKindOrThrow(SyntaxKind.ArrayLiteralExpression));
}

// ---- 순환 감지 (모든 cycle 수집) -------------------------------------------

function detectAllCycles(
  adjacency: Map<string, string[]>,
  allNodes: string[],
): Array<{ from: string; to: string }> {
  const circular: Array<{ from: string; to: string }> = [];
  const circularSet = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string, stack: string[], stackSet: Set<string>): void {
    visited.add(node);
    stackSet.add(node);
    stack.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, stack, stackSet);
      } else if (stackSet.has(neighbor)) {
        // back edge 발견 → cycle 기록 (중복 방지)
        const key = `${node}→${neighbor}`;
        if (!circularSet.has(key)) {
          circularSet.add(key);
          circular.push({ from: node, to: neighbor });
        }
      }
    }

    stack.pop();
    stackSet.delete(node);
    // visited는 삭제하지 않음 (재방문 방지)
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node, [], new Set());
    }
  }

  return circular;
}

// ---- main -------------------------------------------------------------------

export function parseModules(entryPath: string): DiGraph {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  const absoluteEntry = path.resolve(entryPath);
  const rootDir = path.dirname(absoluteEntry);

  project.addSourceFilesFromTsConfig(
    path.resolve(path.dirname(absoluteEntry), '..', 'tsconfig.json'),
  );
  if (project.getSourceFiles().length === 0) {
    project.addSourceFilesAtPaths([`${rootDir}/**/*.ts`, `${rootDir}/../**/*.ts`]);
  }

  const modules: ModuleNode[] = [];
  // filePath 기반 중복 방지 (같은 파일의 같은 클래스명은 한 번만)
  const idSet = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.getFilePath().includes('node_modules')) continue;

    for (const cls of sourceFile.getClasses()) {
      const moduleDecorator = cls.getDecorator('Module');
      if (!moduleDecorator) continue;

      const name = cls.getName() ?? 'Unknown';
      const filePath = sourceFile.getFilePath();
      const id = `${filePath}#${name}`;

      if (idSet.has(id)) continue;
      idSet.add(id);

      const args = moduleDecorator.getArguments();
      if (args.length === 0 || args[0].getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
      const obj = args[0].asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

      modules.push({
        id,
        name,
        filePath,
        imports: getModuleImports(obj),
        providers: getModuleMetadata(obj, 'providers'),
        controllers: getModuleMetadata(obj, 'controllers'),
        exports: getModuleMetadata(obj, 'exports'),
      });
    }
  }

  // ---- 엣지: import name → 실제 모듈 id 해석 --------------------------------
  // name → id[] 역방향 인덱스 (동명 모듈이 여러 개일 수 있음)
  const nameToIds = new Map<string, string[]>();
  for (const mod of modules) {
    if (!nameToIds.has(mod.name)) nameToIds.set(mod.name, []);
    nameToIds.get(mod.name)!.push(mod.id);
  }

  const edges: Array<{ from: string; to: string }> = [];
  const edgeSet = new Set<string>();

  for (const mod of modules) {
    for (const imp of mod.imports) {
      const targetIds = nameToIds.get(imp.name);
      if (!targetIds) continue;

      for (const targetId of targetIds) {
        // 자기 자신 제외
        if (targetId === mod.id) continue;
        const key = `${targetId}→${mod.id}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: targetId, to: mod.id });
        }
      }
    }
  }

  // ---- 순환 감지 (id 기반) ---------------------------------------------------
  const adjacency = new Map<string, string[]>();
  for (const { from, to } of edges) {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push(to);
  }

  const circular = detectAllCycles(
    adjacency,
    modules.map((m) => m.id),
  );

  return { modules, edges, circular };
}
