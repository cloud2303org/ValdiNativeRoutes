import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProductionGeometry as geometry } from './sheet-geometry-extract.mjs';

const metrics = overrides => ({
  width: 400, fullWindowHeight: 800, availableViewportHeight: 800,
  keyboardOverlap: 0, top: 32, left: 8, right: 12, bottom: 24,
  compact: false, ...overrides,
});

test('fixed reference detent has 24vp handle, real viewport and page-owned safe insets', () => {
  assert.deepEqual(geometry(metrics()), {
    rootWidth: 400, rootHeight: 800, panelHeight: 600, panelTop: 200,
    handleHeight: 24, contentHeight: 576,
    contentInsetTop: 0, contentInsetLeft: 8, contentInsetRight: 12, contentInsetBottom: 24,
    keyboardCoveredRemainder: 0,
  });
});

test('fixed keyboard shrink counts full, partial and absent shell resize once', () => {
  for (const resizedBy of [0, 80, 160, 240, 320]) {
    const g = geometry(metrics({ availableViewportHeight: 800 - resizedBy, keyboardOverlap: 320 }));
    assert.equal(g.panelTop, 200, `top after ${resizedBy}vp shell resize`);
    assert.equal(g.contentHeight, 256);
    assert.equal(g.keyboardCoveredRemainder, 320 - resizedBy);
    assert.equal(g.contentInsetBottom, 0);
    assert.equal(g.rootHeight, 800 - resizedBy);
  }
});

test('viewport smaller for an independent reason is never blindly added to keyboard', () => {
  const g = geometry(metrics({ fullWindowHeight: 1000, availableViewportHeight: 900, keyboardOverlap: 60 }));
  assert.equal(g.panelHeight, 650); // .75 * 1000 minus the observed 100vp.
  assert.equal(g.panelTop, 250);
  assert.equal(g.keyboardCoveredRemainder, 0);
  assert.equal(g.contentHeight, 626);
});

test('compact keeps 340vp plus unobscured bottom and rides keyboard across resize policies', () => {
  assert.equal(geometry(metrics({ compact: true })).panelHeight, 388);
  for (const resizedBy of [0, 80, 160, 240, 320]) {
    const g = geometry(metrics({
      compact: true, availableViewportHeight: 800 - resizedBy, keyboardOverlap: 320,
    }));
    assert.equal(g.panelTop, 116);
    assert.equal(g.contentHeight, 340);
    assert.equal(g.panelHeight, 364 + 320 - resizedBy);
    assert.equal(g.contentInsetBottom, 0);
  }
});

test('system-top cap shrinks content rather than covering status/cutout area', () => {
  const g = geometry(metrics({ compact: true, fullWindowHeight: 500, availableViewportHeight: 300, keyboardOverlap: 350, top: 40 }));
  assert.equal(g.panelTop, 40);
  assert.equal(g.panelHeight, 260);
  assert.equal(g.keyboardCoveredRemainder, 150);
  assert.equal(g.contentHeight, 86);
});

test('tiny/zero viewports and oversized safe areas remain bounded', () => {
  const g = geometry(metrics({ width: 10, left: 20, right: 20, availableViewportHeight: 12, top: 32 }));
  assert.equal(g.panelHeight, 0);
  assert.equal(g.contentHeight, 0);
  assert.equal(g.contentInsetLeft, 10);
  assert.equal(g.contentInsetRight, 0);
  assert.equal(g.contentInsetBottom, 0);
  assert.equal(geometry(metrics({ fullWindowHeight: 0, availableViewportHeight: 0 })).panelHeight, 0);
});

test('invalid or incoherent observations fail before reaching native attributes', () => {
  for (const field of ['width', 'fullWindowHeight', 'availableViewportHeight', 'keyboardOverlap', 'top', 'left', 'right', 'bottom']) {
    for (const invalid of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => geometry(metrics({ [field]: invalid })), /coherent nonnegative/);
    }
  }
  assert.throws(() => geometry(metrics({ availableViewportHeight: 801 })), /coherent nonnegative/);
});

test('geometry bounds hold over a deterministic viewport/keyboard/safe-area sweep', () => {
  for (const compact of [false, true])
    for (const fullWindowHeight of [0, 1, 24, 100, 500, 800, 1200])
      for (const ratio of [0, 0.25, 0.5, 0.75, 1])
        for (const keyboardRatio of [0, 0.1, 0.4, 1, 2]) {
          const g = geometry(metrics({
            compact, fullWindowHeight, availableViewportHeight: fullWindowHeight * ratio,
            keyboardOverlap: fullWindowHeight * keyboardRatio,
          }));
          assert.ok(g.panelHeight <= g.rootHeight);
          assert.ok(g.panelTop >= Math.min(32, g.rootHeight));
          assert.ok(g.contentHeight + g.handleHeight <= g.panelHeight);
          assert.ok(g.contentInsetBottom <= g.contentHeight);
          assert.ok(Object.values(g).every(v => Number.isFinite(v) && v >= 0));
        }
});
