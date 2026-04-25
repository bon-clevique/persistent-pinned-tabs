import { describe, it, expect } from 'vitest';
import { isOpenableUrl } from '../src/util/url.js';

describe('isOpenableUrl', () => {
  it('returns true for http://', () => {
    expect(isOpenableUrl('http://example.com')).toBe(true);
  });

  it('returns true for https://', () => {
    expect(isOpenableUrl('https://example.com/path?q=1')).toBe(true);
  });

  it('returns true for ftp://', () => {
    expect(isOpenableUrl('ftp://files.example.com')).toBe(true);
  });

  it('returns false for chrome://', () => {
    expect(isOpenableUrl('chrome://settings')).toBe(false);
  });

  it('returns false for chrome-extension://', () => {
    expect(isOpenableUrl('chrome-extension://abcdef/newtab.html')).toBe(false);
  });

  it('returns false for javascript:', () => {
    expect(isOpenableUrl('javascript:void(0)')).toBe(false);
  });

  it('returns false for file://', () => {
    expect(isOpenableUrl('file:///Users/bon/index.html')).toBe(false);
  });

  it('returns false for about:blank', () => {
    expect(isOpenableUrl('about:blank')).toBe(false);
  });

  it('returns false for about:newtab', () => {
    expect(isOpenableUrl('about:newtab')).toBe(false);
  });

  it('returns false for data:', () => {
    expect(isOpenableUrl('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('returns false for view-source:', () => {
    expect(isOpenableUrl('view-source:https://example.com')).toBe(false);
  });

  it('returns false for edge://', () => {
    expect(isOpenableUrl('edge://settings')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isOpenableUrl('')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isOpenableUrl(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isOpenableUrl(null)).toBe(false);
  });
});
