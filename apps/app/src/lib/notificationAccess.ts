type Dependencies = {
  hasAccess: () => Promise<boolean>;
  openSettings: () => Promise<void>;
  onError: (error: unknown) => void;
};

// One redirect per foreground visit, excluding the return from our own settings
// launch. A denial must not trap someone in an immediate Settings -> app loop.
export function createNotificationAccessCheck(dependencies: Dependencies) {
  let generation = 0;
  let disposed = false;
  let returningFromSettings = false;

  return {
    async resume() {
      if (disposed) return;
      const attempt = ++generation;
      const returning = returningFromSettings;
      returningFromSettings = false;
      try {
        const granted = await dependencies.hasAccess();
        if (disposed || attempt !== generation || granted || returning) return;
        returningFromSettings = true;
        try {
          await dependencies.openSettings();
        } catch (error) {
          returningFromSettings = false;
          throw error;
        }
      } catch (error) {
        if (!disposed && attempt === generation) dependencies.onError(error);
      }
    },
    pause() {
      // Ignore permission results that arrive after the app has left foreground.
      generation++;
    },
    dispose() {
      disposed = true;
      generation++;
    },
  };
}
