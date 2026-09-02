import test from "node:test";
import assert from "node:assert/strict";
import "../demo/safe-router.js";
import {
  createWidgetState,
  demoHandoffOutcome,
  reduceWidgetState,
  routeWidgetQuestion,
  widgetPresentation,
} from "../demo/widget-contract.js";

test("widget starts closed so the host page has no chat before the visitor opens it", () => {
  const state = createWidgetState(1280);

  assert.equal(state.open, false);
  assert.equal(state.panelVisible, false);
});

test("widget opens from its trigger and close plus Escape return focus to that trigger", () => {
  const opened = reduceWidgetState(createWidgetState(1280), "trigger");
  const closed = reduceWidgetState(opened, "close");
  const escaped = reduceWidgetState(opened, "escape");

  assert.deepEqual(opened, { open: true, panelVisible: true, returnFocusToTrigger: false });
  assert.deepEqual(closed, { open: false, panelVisible: false, returnFocusToTrigger: true });
  assert.deepEqual(escaped, { open: false, panelVisible: false, returnFocusToTrigger: true });
});

test("widget uses a desktop side panel and a mobile bottom sheet with a 44px target", () => {
  assert.deepEqual(widgetPresentation(1280), { mode: "side-panel", minTouchTarget: 44 });
  assert.deepEqual(widgetPresentation(390), { mode: "bottom-sheet", minTouchTarget: 44 });
});

test("demo handoff never creates a network request", () => {
  assert.deepEqual(demoHandoffOutcome(), {
    kind: "demo-only",
    networkRequest: null,
    message: "Демо: заявка никуда не отправляется. Канал связи с центром ещё не утверждён.",
  });
});

test("widget keeps the crisis boundary from the approved router", () => {
  const result = routeWidgetQuestion("У меня мысли о самоубийстве");

  assert.equal(result.kind, "crisis");
  assert.match(result.text, /экстренн/i);
  assert.match(result.text, /близк/i);
});
