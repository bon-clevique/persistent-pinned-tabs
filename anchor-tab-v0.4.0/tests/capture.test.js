import { describe, it, expect, beforeEach } from 'vitest';
import { installChromeMock } from './chrome-mock.js';
import { captureCurrentWindow } from '../src/engine/capture.js';

let mock;

beforeEach(() => {
  mock = installChromeMock();
  mock.resetAll();
});

describe('captureCurrentWindow — basic shape', () => {
  it('returns v2 shape: no order field on group or tab', async () => {
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'Dev', color: 'blue', collapsed: false }],
      tabs: [
        { url: 'https://example.com', pinned: false, groupId: 200 },
        { url: 'https://github.com', pinned: false, groupId: 200 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.groups).toHaveLength(1);

    const group = profile.groups[0];
    expect('order' in group).toBe(false);
    expect(group.tabs).toHaveLength(2);
    expect('order' in group.tabs[0]).toBe(false);
  });

  it('captures group name, color, and collapsed flag', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'Work', color: 'green', collapsed: true }],
      tabs: [{ url: 'https://example.com', pinned: false, groupId: 200 }],
    });

    const profile = await captureCurrentWindow(windowId);
    const group = profile.groups[0];

    expect(group.name).toBe('Work');
    expect(group.color).toBe('green');
    expect(group.collapsed).toBe(true);
  });

  it('captures tabs with url and pinned in array order', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [
        { url: 'https://first.com', pinned: true, groupId: 200 },
        { url: 'https://second.com', pinned: false, groupId: 200 },
        { url: 'https://third.com', pinned: false, groupId: 200 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    const tabs = profile.groups[0].tabs;

    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toEqual({ url: 'https://first.com', pinned: true });
    expect(tabs[1]).toEqual({ url: 'https://second.com', pinned: false });
    expect(tabs[2]).toEqual({ url: 'https://third.com', pinned: false });
  });
});

describe('captureCurrentWindow — ungrouped tabs excluded', () => {
  it('excludes tabs with groupId === -1', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [
        { url: 'https://grouped.com', pinned: false, groupId: 200 },
        { url: 'https://ungrouped.com', pinned: false, groupId: -1 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.groups).toHaveLength(1);
    expect(profile.groups[0].tabs).toHaveLength(1);
    expect(profile.groups[0].tabs[0].url).toBe('https://grouped.com');
  });
});

describe('captureCurrentWindow — newtab URL filtering', () => {
  it('excludes chrome://newtab/ URLs', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [
        { url: 'https://valid.com', pinned: false, groupId: 200 },
        { url: 'chrome://newtab/', pinned: false, groupId: 200 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.groups[0].tabs).toHaveLength(1);
    expect(profile.groups[0].tabs[0].url).toBe('https://valid.com');
  });

  it('excludes about:blank URLs', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [
        { url: 'https://valid.com', pinned: false, groupId: 200 },
        { url: 'about:blank', pinned: false, groupId: 200 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.groups[0].tabs).toHaveLength(1);
  });

  it('excludes chrome://newtab-takeover/ URLs', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [
        { url: 'https://valid.com', pinned: false, groupId: 200 },
        { url: 'chrome://newtab-takeover/', pinned: false, groupId: 200 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.groups[0].tabs).toHaveLength(1);
  });

  it('drops empty groups when all tabs are newtab URLs', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [
        { id: 200, title: 'AllNewtab', color: 'grey', collapsed: false },
        { id: 201, title: 'HasReal', color: 'blue', collapsed: false },
      ],
      tabs: [
        { url: 'chrome://newtab/', pinned: false, groupId: 200 },
        { url: 'about:blank', pinned: false, groupId: 200 },
        { url: 'https://example.com', pinned: false, groupId: 201 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.groups).toHaveLength(1);
    expect(profile.groups[0].name).toBe('HasReal');
  });
});

describe('captureCurrentWindow — mode from window.incognito', () => {
  it('sets mode to "normal" for a normal window', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      incognito: false,
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [{ url: 'https://example.com', pinned: false, groupId: 200 }],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.mode).toBe('normal');
  });

  it('sets mode to "incognito" for an incognito window', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      incognito: true,
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [{ url: 'https://example.com', pinned: false, groupId: 200 }],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.mode).toBe('incognito');
  });
});

describe('captureCurrentWindow — group and tab ordering', () => {
  it('orders groups by min tab index', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [
        { id: 200, title: 'Second', color: 'red', collapsed: false },
        { id: 201, title: 'First', color: 'blue', collapsed: false },
      ],
      tabs: [
        // Tabs for group 201 appear first (lower index)
        { url: 'https://first-a.com', pinned: false, groupId: 201 },
        { url: 'https://first-b.com', pinned: false, groupId: 201 },
        // Tabs for group 200 appear later (higher index)
        { url: 'https://second-a.com', pinned: false, groupId: 200 },
        { url: 'https://second-b.com', pinned: false, groupId: 200 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.groups[0].name).toBe('First');
    expect(profile.groups[1].name).toBe('Second');
  });

  it('orders tabs within a group by tab index', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [
        { url: 'https://a.com', pinned: false, groupId: 200 },
        { url: 'https://b.com', pinned: false, groupId: 200 },
        { url: 'https://c.com', pinned: false, groupId: 200 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    const urls = profile.groups[0].tabs.map(t => t.url);
    expect(urls).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });
});

describe('captureCurrentWindow — URL fallback with pendingUrl', () => {
  it('uses pendingUrl when tab.url is empty', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [
        { url: '', pendingUrl: 'https://pending.com', pinned: false, groupId: 200 },
      ],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.groups[0].tabs[0].url).toBe('https://pending.com');
  });
});

describe('captureCurrentWindow — name option', () => {
  it('uses provided name option', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [{ url: 'https://example.com', pinned: false, groupId: 200 }],
    });

    const profile = await captureCurrentWindow(windowId, { name: 'My Profile' });
    expect(profile.name).toBe('My Profile');
  });

  it('defaults name to Window <id> if not provided', async () => {
    mock.resetAll();
    const { windowId } = mock.seedWindow({
      groups: [{ id: 200, title: 'G', color: 'grey', collapsed: false }],
      tabs: [{ url: 'https://example.com', pinned: false, groupId: 200 }],
    });

    const profile = await captureCurrentWindow(windowId);
    expect(profile.name).toBe(`Window ${windowId}`);
  });
});
