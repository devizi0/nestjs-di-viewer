# nestjs-di-viewer

[![npm downloads](https://img.shields.io/npm/dw/nestjs-di-viewer)](https://www.npmjs.com/package/nestjs-di-viewer)

A CLI tool that visualizes NestJS dependency injection graphs as an interactive web UI or exported PNG.

```bash
npm install -g nestjs-di-viewer
nestjs-di-viewer          # auto-detects src/app.module.ts
nestjs-di-viewer src/app.module.ts  # or specify manually
```

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

### Auto-detect entry file

Run without arguments from your NestJS project root. It will automatically find `src/app.module.ts`:

```bash
cd your-nestjs-project
nestjs-di-viewer
```

Or specify the entry file explicitly:

```bash
nestjs-di-viewer src/app.module.ts
```

### Interactive browser UI

Starts a local HTTP server and opens the graph in your browser:

```bash
nestjs-di-viewer
# → Server running at http://localhost:3333
```

> **Note for AI agents:** This command starts a persistent HTTP server and does **not** exit on its own.
> Run it in the background or use the `--export` option instead to avoid blocking execution.
>
> ```bash
> # Background (Unix)
> nestjs-di-viewer &
>
> # Or use PNG export (recommended for agents)
> nestjs-di-viewer --export ./di-graph.png
> ```

### Export as PNG

Renders the graph to a PNG file and exits immediately — no server required:

```bash
nestjs-di-viewer --export ./di-graph.png
nestjs-di-viewer src/app.module.ts --export ./di-graph.png
```

### Output Mermaid diagram text

Prints the raw Mermaid diagram definition to stdout and exits — no server, no file:

```bash
nestjs-di-viewer --diagram
```

Useful for piping into other tools or feeding to AI agents:

```bash
nestjs-di-viewer --diagram | pbcopy   # copy to clipboard
nestjs-di-viewer --diagram > graph.mmd
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `[entry]` | AppModule file path (auto-detected if omitted) | — |
| `-p, --port <number>` | Port for the local server | `3333` |
| `--no-open` | Disable auto-opening the browser | — |
| `--export <path>` | Export graph as PNG and exit | — |
| `--diagram` | Print Mermaid diagram text to stdout and exit | — |

## Example

```bash
# Auto-detect and open browser
nestjs-di-viewer

# Specific entry, custom port
nestjs-di-viewer src/app.module.ts -p 4000

# Export PNG (no server, exits after done)
nestjs-di-viewer --export ./graph.png

# Print Mermaid diagram text
nestjs-di-viewer --diagram
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

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch (`git checkout -b feat/your-feature`)
3. Commit your changes (`git commit -m "feat: add something"`)
4. Push to the branch (`git push origin feat/your-feature`)
5. Open a Pull Request

### Development

```bash
git clone https://github.com/devizi0/nestjs-di-viewer.git
cd nestjs-di-viewer
npm install
npm run build
node dist/cli.js path/to/app.module.ts
```

### Project Structure

```
src/
├── cli.ts       # CLI entry point (commander)
├── parser.ts    # ts-morph based @Module() parser
├── server.ts    # Express server + HTML/Mermaid graph builder
└── export.ts    # Puppeteer PNG export
```

## Changelog

### 1.0.0
- Initial release
- Interactive browser UI with sidebar and module details
- PNG export via Puppeteer
- Circular dependency detection
- Orphan module highlighting
- `forRoot()` / `forFeature()` support

## License

MIT
