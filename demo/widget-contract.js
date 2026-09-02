export function widgetPresentation(viewportWidth) {
  return {
    mode: viewportWidth <= 620 ? "bottom-sheet" : "side-panel",
    minTouchTarget: 44,
  };
}

export function createWidgetState() {
  return { open: false, panelVisible: false, returnFocusToTrigger: false };
}

export function reduceWidgetState(state, action) {
  if (action === "trigger") {
    return state.open
      ? { open: false, panelVisible: false, returnFocusToTrigger: true }
      : { open: true, panelVisible: true, returnFocusToTrigger: false };
  }
  if (action === "close" || action === "escape") {
    return { open: false, panelVisible: false, returnFocusToTrigger: true };
  }
  return state;
}

export function demoHandoffOutcome() {
  return {
    kind: "demo-only",
    networkRequest: null,
    message: "Демо: заявка никуда не отправляется. Канал связи с центром ещё не утверждён.",
  };
}

export function routeWidgetQuestion(question, context = {}) {
  return globalThis.routeQuestion(question, context);
}
