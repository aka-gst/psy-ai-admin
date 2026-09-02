export function widgetPresentation(viewportWidth, voiceCapabilities, askedByVoice = false) {
  const presentation = {
    mode: viewportWidth <= 620 ? "bottom-sheet" : "side-panel",
    minTouchTarget: 44,
  };

  if (!voiceCapabilities) return presentation;

  const inputAvailable = Boolean(voiceCapabilities.recognitionAvailable);
  const outputAvailable = Boolean(voiceCapabilities.speechAvailable);
  return {
    ...presentation,
    voice: {
      inputAvailable,
      outputAvailable,
      fallbackMessage: inputAvailable
        ? (outputAvailable ? "" : "Голосовой ответ недоступен в этом браузере. Ответ останется текстовым.")
        : "Голосовой ввод недоступен в этом браузере. Напишите вопрос текстом.",
      shouldSpeakReply: Boolean(askedByVoice && outputAvailable),
    },
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
