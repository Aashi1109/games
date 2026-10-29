/** Keyboard stance controls; simulation still receives a single crouch intent. */
export function createCrouchInput() {
  let toggled = false;
  return {
    press(code: string, repeat = false) {
      if (repeat) return;
      if (code === 'KeyC') toggled = !toggled;
      else if (
        code === 'Space' ||
        code === 'ShiftLeft' ||
        code === 'ShiftRight'
      )
        toggled = false;
    },
    read(keys: Set<unknown>) {
      return toggled || keys.has('ControlLeft') || keys.has('ControlRight');
    },
    reset() {
      toggled = false;
    },
  };
}
