export function countTestcases(testcases) {
  if (!testcases || typeof testcases !== 'object') return 0;
  return Object.keys(testcases).length;
}

/** testcase1 -> Test Case 1 */
export function formatTestcaseName(name) {
  if (!name) return 'Test Case';
  const match = String(name).match(/^testcase(\d+)$/i);
  if (match) return `Test Case ${match[1]}`;
  return name.replace(/_/g, ' ');
}

/** client1_to_server1 -> client1 to server1 */
export function formatStepLabel(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return 'step';
  return rawKey.replace(/_to_/gi, ' to ').replace(/_/g, ' ').trim();
}

/**
 * Converts internal CN testcase spec to a readable step list.
 * e.g. [{ "client1_to_server1": "hello" }, { "server1_to_client1": "hello" }]
 */
export function parseJsonTestcase(testcase) {
  if (!Array.isArray(testcase)) return [];

  const steps = [];

  const processElement = (el) => {
    if (el == null) return;
    if (Array.isArray(el)) {
      if (
        el.length === 2 &&
        Array.isArray(el[0]) &&
        el[1] &&
        typeof el[1] === 'object' &&
        !Array.isArray(el[1])
      ) {
        Object.entries(el[1]).forEach(([key, value]) => {
          steps.push({ label: formatStepLabel(key), value });
        });
        return;
      }
      el.forEach((sub) => processElement(sub));
      return;
    }

    if (typeof el === 'object') {
      Object.entries(el).forEach(([key, value]) => {
        steps.push({ label: formatStepLabel(key), value });
      });
      return;
    }

    steps.push({ label: 'value', value: String(el) });
  };

  testcase.forEach((item) => processElement(item));
  return steps;
}

export function summarizeResults(results = []) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  return { passed, total, allPassed: total > 0 && passed === total };
}

/** Sort testcase keys: testcase1, testcase2, ... */
export function sortTestcaseKeys(keys = []) {
  return [...keys].sort((a, b) => {
    const na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
    return na - nb;
  });
}
