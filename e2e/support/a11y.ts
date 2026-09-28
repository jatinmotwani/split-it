import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Fails the test on any WCAG 2.x A/AA violation on the current page. */
export async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, 'accessibility violations').toEqual([]);
}
