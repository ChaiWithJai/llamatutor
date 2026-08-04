import type { BinaryMetrics } from "./types";

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function binaryMetrics(
  rows: Array<{ expected: boolean; predicted: boolean }>,
): BinaryMetrics {
  const truePositive = rows.filter(
    (row) => row.expected && row.predicted,
  ).length;
  const trueNegative = rows.filter(
    (row) => !row.expected && !row.predicted,
  ).length;
  const falsePositive = rows.filter(
    (row) => !row.expected && row.predicted,
  ).length;
  const falseNegative = rows.filter(
    (row) => row.expected && !row.predicted,
  ).length;
  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);

  return {
    support: rows.length,
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    precision,
    recall,
    specificity: ratio(trueNegative, trueNegative + falsePositive),
    f1:
      precision === null || recall === null || precision + recall === 0
        ? null
        : (2 * precision * recall) / (precision + recall),
  };
}

export function percentile(values: number[], quantile: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * quantile) - 1] ?? null;
}
