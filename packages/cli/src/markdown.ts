import chalk from "chalk";
import { highlight } from "cli-highlight";

function guessLanguage(info: string): string | undefined {
  const normalized = info.trim().toLowerCase();

  if (!normalized) return undefined;

  if (["ts", "tsx"].includes(normalized)) return "typescript";
  if (["js", "jsx", "mjs", "cjs"].includes(normalized)) return "javascript";
  if (["sh", "bash", "zsh"].includes(normalized)) return "bash";
  if (["md", "markdown"].includes(normalized)) return "markdown";
  if (["yml"].includes(normalized)) return "yaml";

  return normalized;
}

function highlightCode(code: string, language?: string): string {
  try {
    return highlight(code, {
      language,
      ignoreIllegals: true
    });
  } catch {
    return chalk.gray(code);
  }
}

function renderMarkdownLine(line: string): string {
  if (/^#{1,6}\s+/.test(line)) {
    return chalk.cyanBright.bold(line);
  }

  if (/^\s*[-*]\s+/.test(line)) {
    return line.replace(/^(\s*[-*]\s+)/, chalk.yellow("$1"));
  }

  if (/^\s*\d+\.\s+/.test(line)) {
    return line.replace(/^(\s*\d+\.\s+)/, chalk.yellow("$1"));
  }

  if (/^File:\s+/.test(line)) {
    return chalk.magentaBright.bold(line);
  }

  let rendered = line;

  rendered = rendered.replace(/`([^`]+)`/g, (_match, code) =>
    chalk.black.bgWhite(` ${code} `)
  );

  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, (_match, bold) =>
    chalk.bold(bold)
  );

  return rendered;
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const rendered: string[] = [];

  let inCodeBlock = false;
  let codeLanguage: string | undefined;
  let codeLines: string[] = [];

  function flushCodeBlock(): void {
    rendered.push(highlightCode(codeLines.join("\n"), codeLanguage));
    codeLines = [];
    codeLanguage = undefined;
  }

  for (const line of lines) {
    const fence = line.match(/^```\s*([A-Za-z0-9_-]+)?\s*$/);

    if (fence) {
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLanguage = guessLanguage(fence[1] ?? "");
      }

      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    rendered.push(renderMarkdownLine(line));
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }

  return rendered.join("\n");
}
