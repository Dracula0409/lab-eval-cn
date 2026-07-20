/**
 * Shared helpers for the teacher "Student Performances" feature.
 *
 * Turns a raw EvaluationRun (produced by runAndEvaluate in sshController.js)
 * into the flattened, spreadsheet-friendly shape:
 *   Question | TC1..TCn | Persistence | Listen | Established | Closed
 *
 * Conventions (inferred from the evaluation_framework CSV formats — see
 * evaluationHelper.js parseEvaluatedCsv / parseConnCsv / parseStatusCsv):
 *  - TC1..TCn are every communication-pair verdict across ALL testcase rows
 *    for that question, concatenated in order (not literal "testcase1/2"
 *    names — those are folded into a running sequence).
 *  - Persistence shows the raw descriptor from status.csv column 3
 *    (e.g. "non-persistent"), not a Correct/Wrong verdict.
 *  - conn.csv rows are positional: row 0 = Listen check, row 1 = Established
 *    check, row 2 = Closed check. Extra rows beyond 3 are ignored by the
 *    fixed-column CSV export (but preserved in the JSON student report).
 */

const CONN_LABELS = ['Listen', 'Established', 'Closed'];

/** Pick the best available run for a (userId, questionId) pair: prefer the
 * latest "submit", fall back to the latest run of any type. */
export function pickBestRun(runsForPair = []) {
  if (!runsForPair.length) return null;
  const submit = runsForPair.find((r) => r.runType === 'submit');
  return submit || runsForPair[0]; // runsForPair assumed sorted by createdAt desc
}

/** Flatten a run's communicationResults into a simple ['Correct'|'Wrong', ...] list. */
export function flattenTcVerdicts(run) {
  const out = [];
  for (const tc of run?.communicationResults || []) {
    for (const p of tc.pairs || []) {
      out.push(p.verdict === 'correct' ? 'Correct' : 'Wrong');
    }
  }
  return out;
}

/** Raw persistence descriptor from status.csv (column index 2), if present. */
export function getPersistence(run) {
  const rows = run?.statusResults || [];
  if (!rows.length) return '';
  return rows[0]?.cols?.[2] ?? '';
}

/** { Listen, Established, Closed } -> 'Correct' | 'Wrong' | '' */
export function getConnVerdicts(run) {
  const rows = run?.connResults || [];
  const out = {};
  CONN_LABELS.forEach((label, i) => {
    out[label] = rows[i] ? (rows[i].passed ? 'Correct' : 'Wrong') : '';
  });
  return out;
}

/**
 * Build the full per-question report block for one student.
 * `question` may be a lean Question/CNQuestion doc; `run` is the chosen
 * EvaluationRun (or null/undefined if the student never attempted it).
 */
export function buildQuestionReport(question, run) {
  const conn = getConnVerdicts(run);
  return {
    questionId: question._id?.toString?.() ?? String(question._id ?? question.questionId ?? ''),
    questionKey: question.questionKey || run?.questionKey || '',
    title: question.title || '',
    attempted: !!run,
    runType: run?.runType || null,
    submittedAt: run?.createdAt || null,
    tcVerdicts: flattenTcVerdicts(run),
    persistence: getPersistence(run),
    ...conn, // Listen / Established / Closed
  };
}

export function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export { CONN_LABELS };