export type ParsedEdit = {
  path: string;
  content: string;
};

export function parseFullFileBlocks(_output: string): ParsedEdit[] {
  // TODO: parse full-file replacement blocks.
  return [];
}
