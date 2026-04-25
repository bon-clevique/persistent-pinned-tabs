/**
 * xss-defense.spec.js
 *
 * Verifies that importing a JSON file with a malicious profile id / name
 * is rejected before any DOM rendering, and no alert/dialog fires.
 */
import { test, expect, openOptionsPage } from '../fixtures.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

test.describe('XSS Defense', () => {
  test('import with malicious profile id is rejected without executing scripts', async ({ extContext, extensionId }) => {
    const page = await openOptionsPage(extContext, extensionId);

    // Track any unexpected dialogs (alert/confirm/prompt)
    let dialogFired = false;
    page.on('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    // ── Build malicious JSON ──────────────────────────────────────────────────
    // Profile id contains script injection attempt.
    // The validator should reject this because the id is not a valid UUID.
    const maliciousJson = {
      schemaVersion: 2,
      profiles: [
        {
          id: '<script>alert(1)</script>',   // invalid UUID → rejected by isProfile
          name: '<img src=x onerror=alert(2)>',
          mode: 'normal',
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          groups: [],
        },
      ],
    };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchortab-xss-'));
    const maliciousPath = path.join(tmpDir, 'malicious.json');
    fs.writeFileSync(maliciousPath, JSON.stringify(maliciousJson));

    // ── Attempt import ────────────────────────────────────────────────────────
    await page.setInputFiles('#file-input', maliciousPath);

    // Error banner should appear (schema validation failure)
    await expect(
      page.locator('#banner-area .banner-error')
    ).toBeVisible({ timeout: 5000 });

    // No alert dialog should have fired
    expect(dialogFired).toBe(false);

    // The malicious name/id should not appear in the DOM as rendered HTML
    const bodyHtml = await page.content();
    expect(bodyHtml).not.toContain('<script>alert(1)</script>');
    expect(bodyHtml).not.toContain('onerror=alert(2)');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('import with malicious name in tabs is rejected', async ({ extContext, extensionId }) => {
    const page = await openOptionsPage(extContext, extensionId);

    let dialogFired = false;
    page.on('dialog', async (dialog) => {
      dialogFired = true;
      await dialog.dismiss();
    });

    // This payload passes the id/uuid check but has a tab with an XSS attempt in url.
    // tab.url validation requires a non-empty string, but isOpenableUrl would reject it.
    // However, the import validator (validateProfileCollection → isTab) checks url is non-empty.
    // A url of 'javascript:alert(1)' is a non-empty string, so it would PASS the schema check,
    // but the tab would be skipped at apply time by isOpenableUrl.
    // For the XSS test, we want to verify that if the name contains script tags,
    // the escaping in the DOM prevents execution.
    // The profile will be IMPORTED (schema-valid), but the name must be escaped in the DOM.
    const profileId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    const now = new Date().toISOString();

    const xssNameJson = {
      schemaVersion: 2,
      profiles: [
        {
          id: profileId,
          name: '<script>alert("xss")</script>',
          mode: 'normal',
          isDefault: false,
          createdAt: now,
          updatedAt: now,
          groups: [
            {
              id: groupId,
              name: 'OK Group',
              color: 'blue',
              collapsed: false,
              tabs: [
                { url: 'https://example.com', pinned: false },
              ],
            },
          ],
        },
      ],
    };

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchortab-xss2-'));
    const xssPath = path.join(tmpDir, 'xss-name.json');
    fs.writeFileSync(xssPath, JSON.stringify(xssNameJson));

    await page.setInputFiles('#file-input', xssPath);

    // Import completes (schema is valid)
    await expect(
      page.locator('#banner-area .banner-success, #banner-area .banner-error')
    ).toBeVisible({ timeout: 5000 });

    // No dialog fired — script tag in name did not execute
    expect(dialogFired).toBe(false);

    // The raw script tag should not appear unescaped in the HTML
    const bodyHtml = await page.content();
    expect(bodyHtml).not.toContain('<script>alert("xss")</script>');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
