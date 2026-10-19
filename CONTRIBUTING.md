# Contributing to Pact

Read AGENTS.md and the Pact blueprint before changing behavior. Implement small vertical slices with an explicit acceptance criterion. Preserve historical research and label synthetic data.

For a documentation change, run `python3 scripts/check_pact_docs.py` and `git diff --check`. For runtime changes, add actual setup commands and run typecheck, lint, tests and build once implemented. Include test results and limitations in the pull request.

Never commit credentials or customer correspondence. Third-party dependencies/assets require compatible usage rights. Changes to payment authority, data retention or production onboarding require revisiting the relevant blueprint decisions.
