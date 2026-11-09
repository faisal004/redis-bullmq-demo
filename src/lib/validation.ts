export function parseFileEvent(value: unknown): {
  fileName: string;
  pages: number;
  simulateFailure: boolean;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Provide a JSON file event.");
  }
  const input = value as Record<string, unknown>;
  const fileName = input.fileName;
  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 120 ||
      /[\\/\u0000-\u001f\u007f]/.test(fileName) || !/\.(pdf|docx)$/i.test(fileName)) {
    throw new Error("Use a PDF or DOCX filename of at most 120 characters, without paths.");
  }
  const pages = input.pages ?? 12;
  if (typeof pages !== "number" || !Number.isInteger(pages) || pages < 1 || pages > 500) {
    throw new Error("Pages must be a whole number between 1 and 500.");
  }
  if (input.simulateFailure !== undefined && typeof input.simulateFailure !== "boolean") {
    throw new Error("simulateFailure must be a boolean.");
  }
  return { fileName: fileName.trim(), pages, simulateFailure: input.simulateFailure === true };
}
