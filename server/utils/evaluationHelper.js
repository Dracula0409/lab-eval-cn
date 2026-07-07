/**
 * Helpers for CN lab evaluation (networklab user, nice.sh harness, CSV parsing).
 */

const EVAL_DIR = "/home/networklab/evaluation";

export function buildTestcasesJson(questionKey, testcases) {
  return JSON.stringify({ [questionKey]: testcases || {} }, null, 2);
}

export function buildStudentSh(studentId, studentName) {
  return `student_name="${studentName || studentId}"\nstudent_id="${studentId}"\n`;
}

export function buildTagsSh(tagPaths = {}) {
  const lines = Object.entries(tagPaths).map(
    ([tag, filePath]) => `TAG_${tag}="${filePath}"`
  );
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export function buildNiceScript({ questionKey, evalScriptBody, tagPaths }) {
  const tagExports = buildTagsSh(tagPaths);

  return `#!/bin/bash
set -e
cd ${EVAL_DIR}

declare -i PROGRAMS_RAN_COUNT=0
declare -A coprocPids
declare -A coprocFDs
declare -A coprocReadFDs
declare -A programPids
declare -A Assigned_Ports

Qi="${questionKey}"
> connectionstatus.log
> unitsep.log

${tagExports}
source ./fun.sh
source ./clientPorts.sh
source ./serverPorts.sh
source ./student.sh

> "\${student_id}_conn.csv"
> "\${student_id}_status.csv"
> "\${student_id}_evaluated.csv"

${evalScriptBody || "echo 'No evalScript defined for this question'"}
`;
}

/**
 * Parse {studentId}_evaluated.csv rows produced by new_evaluation.py.
 */
export function parseEvaluatedCsv(csvContent, studentId) {
  if (!csvContent?.trim()) return [];

  const lines = csvContent.trim().split("\n");
  const results = [];

  for (const line of lines) {
    const cols = line.split(",").map((c) => c.trim());
    if (!cols.length || cols[0] === "student_id") continue;
    if (studentId && cols[0] !== studentId) continue;

    const testcaseRef = cols[1];
    const pairs = [];

    for (let i = 2; i < cols.length; i += 2) {
      pairs.push({
        pairIndex: (i - 2) / 2,
        seen: cols[i] || "fail",
        verdict: cols[i + 1] || "wrong",
      });
    }

    results.push({
      testcase: testcaseRef,
      pairs,
      allCorrect: pairs.length > 0 && pairs.every((p) => p.verdict === "correct"),
    });
  }

  return results;
}

/**
 * Parse {studentId}_conn.csv — connection establishment checks.
 * e.g. server1,listen,correct
 */
export function parseConnCsv(csvContent) {
  if (!csvContent?.trim()) return [];

  return csvContent
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        entity: cols[0] || "",
        peer: cols[1] || "",
        state: cols[2] || "",
        verdict: cols[3] || "wrong",
        passed: cols[3] === "correct",
      };
    });
}

/**
 * Parse {studentId}_status.csv — persistence / status checks.
 */
export function parseStatusCsv(csvContent) {
  if (!csvContent?.trim()) return [];

  return csvContent
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        raw: line,
        cols,
        passed: cols.some((c) => c === "correct" || c === "ok"),
      };
    });
}

/** Strip q1. prefix for display: q1.testcase1 -> testcase1 */
export function shortTestcaseName(fullRef) {
  if (!fullRef) return "";
  const dot = fullRef.indexOf(".");
  return dot >= 0 ? fullRef.slice(dot + 1) : fullRef;
}

export function toApiResults(communicationResults) {
  return communicationResults.map((tc) => ({
    name: shortTestcaseName(tc.testcase),
    fullName: tc.testcase,
    passed: tc.allCorrect,
    pairs: tc.pairs,
    output: tc.pairs
      .map((p, i) => `Pair ${i + 1}: ${p.seen}/${p.verdict}`)
      .join("; "),
    error: tc.allCorrect ? null : "One or more communication checks failed",
  }));
}

export { EVAL_DIR };
