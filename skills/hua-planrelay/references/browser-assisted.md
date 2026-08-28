# Browser-assisted handoff

Use this mode only when the user explicitly authorizes browser control for the current request and a browser-control capability is available. Otherwise use the manual handoff.

## Preconditions

1. Run `hua-planrelay doctor`, then `hua-planrelay status`.
2. Confirm the gateway/tunnel is running and the Hua PlanRelay connection is already configured in ChatGPT.
3. Confirm the status is asking for a plan or review. Never open the browser merely to poll.

## Safe browser procedure

1. Open the user's existing ChatGPT tab or `https://chatgpt.com/`. Do not create an account or change workspace settings.
2. If sign-in, CAPTCHA, 2FA, a consent dialog, payment, or account recovery appears, stop and ask the user to complete it. Never read or type secrets.
3. Start or reuse a conversation chosen for this PlanRelay task. Attach the existing Hua PlanRelay connection from the tools menu if it is not already attached.
4. If Sol is available, select it. Do not claim Sol was selected unless the visible UI confirms it. If it is unavailable, stop and report the limitation.
5. Send exactly one bounded control prompt:
   - Plan: `Plan the current Hua PlanRelay task. Read workflow_status and only the minimum workspace context needed. Publish one finite plan for the reported task and iteration.`
   - Review: `Review the current Hua PlanRelay task. Read workflow_status and test_summary, inspect git_status, the complete relevant git_diff pages, and only necessary file ranges. Publish one review with the exact evidence object from test_summary.`
6. Wait for the response to finish. Do not send follow-up prompts to coax a desired verdict.
7. Return to the local workflow and run `hua-planrelay status`. Trust the append-only record, not text visible in the browser.

## Stopping rules

- At most one browser message per required plan or review stage.
- Stop on `done`, `blocked`, or `iteration_limit_reached`.
- Stop if the task ID, iteration, base commit, connection, workspace, or selected model cannot be verified.
- Never approve external publication, purchases, account changes, destructive actions, or expanded repository access from the browser.
