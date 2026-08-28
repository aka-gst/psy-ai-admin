// Проверка одного кейса и сборка метрик. Ожидания описаны в наборе, а не в коде,
// чтобы добавление вопроса не требовало правки харнесса.

export function checkCase(testCase, answer) {
  const expect = testCase.expect ?? {};
  const checks = [];
  if (expect.source !== undefined) {
    checks.push({ name: "source", ok: answer.sourceKey === expect.source, want: expect.source, got: answer.sourceKey });
  }
  if (expect.kind !== undefined) {
    checks.push({ name: "kind", ok: answer.kind === expect.kind, want: expect.kind, got: answer.kind });
  }
  if (expect.match) {
    checks.push({ name: "match", ok: new RegExp(expect.match, "i").test(answer.text), want: expect.match, got: answer.text });
  }
  if (expect.notMatch) {
    checks.push({ name: "notMatch", ok: !new RegExp(expect.notMatch, "i").test(answer.text), want: `не содержит ${expect.notMatch}`, got: answer.text });
  }
  return { pass: checks.every((check) => check.ok), checks, answer };
}

const share = (part, total) => (total ? Math.round((part / total) * 1000) / 10 : 0);

export function summarise(results) {
  const total = results.length;
  const passed = results.filter((item) => item.pass).length;
  const critical = results.filter((item) => item.testCase.severity === "critical");
  const criticalPassed = critical.filter((item) => item.pass).length;
  const abstained = results.filter((item) => item.answer.kind === "unknown").length;
  // Уверенно неверный маршрут: помощник назвал страницу, она не та, и он не признал незнание.
  const confidentlyWrong = results.filter((item) => {
    const want = item.testCase.expect?.source;
    return want !== undefined && item.answer.kind !== "unknown" && item.answer.sourceKey !== null && item.answer.sourceKey !== want;
  }).length;

  const byCategory = new Map();
  for (const item of results) {
    const bucket = byCategory.get(item.testCase.category) ?? { total: 0, passed: 0 };
    bucket.total += 1;
    if (item.pass) bucket.passed += 1;
    byCategory.set(item.testCase.category, bucket);
  }

  return {
    total,
    passed,
    accuracy: share(passed, total),
    criticalTotal: critical.length,
    criticalPassed,
    safetyRecall: share(criticalPassed, critical.length),
    abstained,
    abstentionRate: share(abstained, total),
    confidentlyWrong,
    confidentlyWrongRate: share(confidentlyWrong, total),
    byCategory: [...byCategory.entries()]
      .map(([category, bucket]) => ({ category, ...bucket, accuracy: share(bucket.passed, bucket.total) }))
      .sort((a, b) => a.accuracy - b.accuracy),
  };
}
