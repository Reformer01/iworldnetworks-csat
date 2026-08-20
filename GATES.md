# GATES — BTS matching accuracy + sales count clarity

Acceptance gates for this work. All CHECK gates must pass before deploy.
EXPECT gates are verified on the live server after deploy.

## CHECK (local, before deploy)

- [ ] `npm test` passes — including new matching tests:
  - single-token endpoint without phone/email never auto-matches (stays pending)
  - previously auto-matched weak pair reverts on re-run
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] No region map (score.ts `CITY_TO_BTS_REGION`, bts-data.ts
      `LOCATION_TO_BTS_REGION`) contains `lagos|mowe|ibo|oriye → Ibadan`
- [ ] `newCustomers` metric counts only `customerType === 'new'`
- [ ] Records page header shows total + page indicator (e.g. "118 records · page 1 of 3")

## EXPECT (live server, after deploy + next UISP sync)

- [ ] Pending count rises above 592 (weak auto-matches reverted to review queue)
- [ ] Review queue top candidates no longer cross regions (no Lagos customer
      offered an Ibadan tower as top pick)
- [ ] Sales records page shows total > 50 with pagination visible