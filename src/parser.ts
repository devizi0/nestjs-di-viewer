import { Project, SyntaxKind, ObjectLiteralExpression, ArrayLiteralExpression } from 'ts-morph';
import * as path from 'path';

export interface ModuleNode {
  name: string;
  filePath: string;
  imports: string[];
  providers: string[];
  controllers: string[];
  exports: string[];
}

export interface DiGraph {
  modules: ModuleNode[];
  edges: Array<{ from: string; to: string }>;
  circular: Array<{ from: string; to: string }>;
}

function extractStringArray(arr: ArrayLiteralExpression): string[] {
  return arr.getElements().map((el) => {
    // { provide: X, useClass: Y } 커스텀 프로바이더
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
    // SomeModule.forRoot(), SomeModule.forFeature() 등
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

function getModuleMetadata(objLiteral: ObjectLiteralExpression, key: string): string[] {
  const prop = objLiteral.getProperty(key);
  if (!prop) return [];
  const initializer = prop.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
  if (!initializer || initializer.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  return extractStringArray(initializer.asKindOrThrow(SyntaxKind.ArrayLiteralExpression));
}

export function parseModules(entryPath: string): DiGraph {
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  const absoluteEntry = path.resolve(entryPath);
  const rootDir = path.dirname(absoluteEntry);

  // 재귀적으로 모든 .ts 파일 추가
  project.addSourceFilesFromTsConfig(
    path.resolve(path.dirname(absoluteEntry), '..', 'tsconfig.json'),
  );
  // tsconfig 없으면 폴더 전체 추가
  if (project.getSourceFiles().length === 0) {
    project.addSourceFilesAtPaths([`${rootDir}/**/*.ts`, `${rootDir}/../**/*.ts`]);
  }

  const modules: ModuleNode[] = [];
  const nameSet = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    if (sourceFile.getFilePath().includes('node_modules')) continue;

    const classes = sourceFile.getClasses();
    for (const cls of classes) {
      const moduleDecorator = cls.getDecorator('Module');
      if (!moduleDecorator) continue;

      const name = cls.getName() ?? 'Unknown';
      if (nameSet.has(name)) continue;
      nameSet.add(name);

      const args = moduleDecorator.getArguments();
      if (args.length === 0 || args[0].getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
      const obj = args[0].asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

      modules.push({
        name,
        filePath: sourceFile.getFilePath(),
        imports: getModuleMetadata(obj, 'imports'),
        providers: getModuleMetadata(obj, 'providers'),
        controllers: getModuleMetadata(obj, 'controllers'),
        exports: getModuleMetadata(obj, 'exports'),
      });
    }
  }

  // 엣지 계산
  const edges: Array<{ from: string; to: string }> = [];
  const moduleNames = new Set(modules.map((m) => m.name));

  for (const mod of modules) {
    for (const imp of mod.imports) {
      if (moduleNames.has(imp)) {
        edges.push({ from: imp, to: mod.name });
      }
    }
  }

  // 순환 의존성 감지 (DFS)
  const circular: Array<{ from: string; to: string }> = [];
  const adjacency = new Map<string, string[]>();
  for (const { from, to } of edges) {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push(to);
  }

  function hasCycle(node: string, visited: Set<string>, stack: Set<string>): boolean {
    visited.add(node);
    stack.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor, visited, stack)) return true;
      } else if (stack.has(neighbor)) {
        circular.push({ from: node, to: neighbor });
        return true;
      }
    }
    stack.delete(node);
    return false;
  }

  const visited = new Set<string>();
  for (const name of moduleNames) {
    if (!visited.has(name)) hasCycle(name, visited, new Set());
  }

  return { modules, edges, circular };
}
