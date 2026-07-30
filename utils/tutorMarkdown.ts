const SEPARATOR_CELL = /^:?-{3,}:?$/;

function rebuildInlineTable(line: string): string {
  if (!line.includes("|")) return line;

  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  const separatorStart = cells.findIndex((cell) => SEPARATOR_CELL.test(cell));
  if (separatorStart < 2) return line;

  let columnCount = 0;
  while (
    separatorStart + columnCount < cells.length &&
    SEPARATOR_CELL.test(cells[separatorStart + columnCount]!)
  ) {
    columnCount += 1;
  }
  if (columnCount < 2 || separatorStart < columnCount) return line;

  const prefixCells = cells.slice(0, separatorStart - columnCount);
  const header = cells.slice(separatorStart - columnCount, separatorStart);
  const separator = cells.slice(separatorStart, separatorStart + columnCount);
  const data = cells.slice(separatorStart + columnCount);
  if (data.length % columnCount !== 0) return line;

  const rows = [header, separator];
  for (let index = 0; index < data.length; index += columnCount) {
    rows.push(data.slice(index, index + columnCount));
  }

  const table = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return prefixCells.length ? `${prefixCells.join(" | ")}\n\n${table}` : table;
}

/**
 * Repairs the common streamed-model failure where an otherwise valid GFM
 * table is emitted on one line. Ambiguous pipe text is deliberately left
 * untouched.
 */
export function normalizeTutorMarkdown(markdown: string): string {
  return markdown.split("\n").map(rebuildInlineTable).join("\n");
}
