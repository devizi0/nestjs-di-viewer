# nestjs-di-viewer

A CLI tool that visualizes NestJS dependency injection graphs as an interactive web UI or exported PNG.

## Features

- Parses all `@Module()` decorators across your NestJS project
- Renders an interactive dependency graph in the browser
- Detects circular dependencies
- Highlights orphan modules
- Exports the graph as a PNG image
- Supports `forRoot()` / `forFeature()` and custom providers

## Installation

```bash
npm install -g nestjs-di-viewer
```

## Usage

### Interactive browser UI

```bash
nestjs-di-viewer src/app.module.ts
```

Opens a local server at `http://localhost:3333` with an interactive graph.

### Export as PNG

```bash
nestjs-di-viewer src/app.module.ts --export ./di-graph.png
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <number>` | Port for the local server | `3333` |
| `--no-open` | Disable auto-opening the browser | — |
| `--export <path>` | Export graph as PNG | — |

## Example

```bash
# Start interactive viewer
nestjs-di-viewer src/app.module.ts -p 4000

# Export PNG
nestjs-di-viewer src/app.module.ts --export ./graph.png
```

## Graph Legend

| Color | Meaning |
|-------|---------|
| Blue border | Normal module |
| Red border | Circular dependency |
| Orange dashed | Orphan module (not imported by any other module) |

## Requirements

- Node.js 18+
- NestJS project with TypeScript source

## License

MIT
