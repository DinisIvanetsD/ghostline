import type { RunConditions } from "../types";

// Difficulty values stay in English in saved data and backups; only the label is localized.
const DIFFICULTY_LABELS: Record<string, string> = {
  Green: "Verde",
  Blue: "Azul",
  Red: "Vermelha",
  Black: "Preta",
  "Double black": "Dupla preta",
};
export const DIFFICULTIES = Object.keys(DIFFICULTY_LABELS);
export const difficultyLabel = (value?: string) =>
  value ? (DIFFICULTY_LABELS[value] ?? value) : "";

export const CONDITION_LABELS: Record<RunConditions, string> = {
  dry: "Seco",
  damp: "Húmido",
  wet: "Molhado",
  mud: "Lama",
};
export const CONDITIONS = Object.keys(CONDITION_LABELS) as RunConditions[];
