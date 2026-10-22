#!/usr/bin/env python3
"""Check local blueprint links and synthetic fixture consistency; no runtime claims."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
docs = [ROOT / 'README.md', ROOT / 'AGENTS.md', ROOT / 'CONTRIBUTING.md', ROOT / 'SECURITY.md', *sorted((ROOT / 'docs/pact').glob('*.md'))]
errors = []
links = 0
for doc in docs:
    text = doc.read_text()
    if text.count('```') % 2:
        errors.append(f'{doc.relative_to(ROOT)}: unbalanced code fences')
    for target in re.findall(r'\[[^\]]*\]\(([^\s)]+)\)', text):
        if target.startswith(('https://', 'http://', 'mailto:', '#')):
            continue
        links += 1
        if not (doc.parent / target.split('#')[0]).resolve().exists():
            errors.append(f'{doc.relative_to(ROOT)}: missing link {target}')
scenarios = json.loads((ROOT / 'fixtures/pact/scenarios.json').read_text())
for case in scenarios:
    assert case['synthetic'] is True
    assert case['currency'] == 'USD'
    target = (case['revised_total_minor'] * case['deposit_basis_points'] + 5000) // 10000
    due = max(0, target - case['prior_paid_minor'])
    if due != case['expected_additional_deposit_minor']:
        errors.append(f"{case['id']}: additional deposit mismatch")
    if case['revised_total_minor'] - case['prior_paid_minor'] - due != case['expected_remaining_balance_minor']:
        errors.append(f"{case['id']}: remaining balance mismatch")
cases = json.loads((ROOT / 'fixtures/pact/ai-cases.json').read_text())
if len({c['id'] for c in cases}) != len(cases):
    errors.append('AI case IDs are not unique')
for case in cases:
    if not case['synthetic'] or case['may_mutate_authoritative_state']:
        errors.append(f"{case['id']}: invalid proposal-only fixture")
if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: {len(docs)} Markdown documents, {links} local links, {len(scenarios)} payment fixtures, {len(cases)} AI cases')
print('This validates documentation/fixtures, not a Pact application or model performance.')
