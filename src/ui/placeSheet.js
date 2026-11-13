(() => {
  'use strict';

  const THRESHOLD = 50;
  const BURST_GAP = 250;
  const INTERACTIVE = 'button, input, select, textarea, a, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

  window.placeSheet = {
    attach(panel, { level = 'half', onClose } = {}) {
      let current = level === 'full' ? 'full' : 'half';
      let disposed = false, pointer = null, touch = null, wheel = null;
      const removers = [];
      const isInteractive = target => Boolean(target.closest?.(INTERACTIVE));
      const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        removers.push(() => target.removeEventListener(type, handler, options));
      };
      const setLevel = next => {
        if (disposed) return;
        current = next;
        panel.classList.toggle('full', next === 'full');
        if (next === 'half') panel.scrollTop = 0;
      };
      const expand = () => setLevel('full');
      const collapse = () => {
        if (disposed) return;
        if (current === 'full') setLevel('half');
        else if (typeof onClose === 'function') onClose();
      };
      const begin = (target, x, y, id) => {
        if (isInteractive(target)) return null;
        return {
          x, y, id, level: current, done: false, close: false,
          down: panel.scrollTop <= 0 || Boolean(target.closest?.('.grab, .sh-h')),
        };
      };
      // Eligibility is fixed at gesture start: native scrolling to the top
      // requires a fresh downward gesture before the sheet can collapse.
      const move = (gesture, x, y) => {
        if (!gesture) return false;
        const dy = y - gesture.y, dx = x - gesture.x;
        if (Math.abs(dy) <= Math.abs(dx)) return false;
        if (gesture.done) return gesture.level === 'half' || (gesture.down && dy > 0);
        if (gesture.level !== current) {
          gesture.done = true;
          return false;
        }
        const manual = current === 'half' || (gesture.down && dy > 0);
        if (!manual || Math.abs(dy) < THRESHOLD) return manual;
        gesture.done = true;
        if (current === 'half' && dy < 0) expand();
        else if (current === 'full') collapse();
        else gesture.close = true; // Close only on release, never on cancellation.
        return true;
      };
      const finish = (gesture, cancelled = false) => {
        if (!cancelled && gesture?.close && current === 'half') collapse();
      };
      panel.classList.add('place-sheet');
      setLevel(current);

      // Pointer events cover mouse/pen; touch has its own native-scroll path.
      listen(panel, 'pointerdown', event => {
        if (event.pointerType === 'touch' || event.button !== 0 || event.isPrimary === false) return;
        pointer = begin(event.target, event.clientX, event.clientY, event.pointerId);
      });
      listen(window, 'pointermove', event => {
        if (event.pointerType === 'touch' || !pointer || pointer.id !== event.pointerId) return;
        if (move(pointer, event.clientX, event.clientY)) event.preventDefault();
      });
      const endPointer = event => {
        if (event.pointerType === 'touch' || !pointer || pointer.id !== event.pointerId) return;
        const gesture = pointer;
        pointer = null;
        finish(gesture, event.type === 'pointercancel');
      };
      listen(window, 'pointerup', endPointer);
      listen(window, 'pointercancel', endPointer);

      listen(panel, 'touchstart', event => {
        touch = null;
        if (event.touches.length !== 1) return;
        const point = event.touches[0];
        touch = begin(event.target, point.clientX, point.clientY, point.identifier);
      }, { passive: true });
      listen(panel, 'touchmove', event => {
        if (!touch) return;
        if (event.touches.length !== 1) { touch = null; return; }
        const point = event.touches[0];
        if (point.identifier !== touch.id) { touch = null; return; }
        if (move(touch, point.clientX, point.clientY) && event.cancelable) event.preventDefault();
      }, { passive: false });
      listen(panel, 'touchend', event => {
        if (!touch) return;
        if (!Array.from(event.changedTouches).some(point => point.identifier === touch.id)) return;
        const gesture = touch;
        touch = null;
        finish(gesture);
      }, { passive: true });
      listen(panel, 'touchcancel', () => { touch = null; }, { passive: true });

      listen(panel, 'wheel', event => {
        if (event.ctrlKey || isInteractive(event.target)) return;
        const now = performance.now();
        if (!wheel || now - wheel.time > BURST_GAP) {
          wheel = { time: now, level: current, sum: 0, locked: false,
            native: current === 'full' && panel.scrollTop > 0 };
        }
        wheel.time = now; // Every event extends the burst, including locked ones.
        const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? panel.clientHeight : 1);
        if (!dy || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        if (wheel.native) return;
        if (wheel.level !== current) wheel.locked = true;
        if (wheel.locked) {
          if (current === 'half' || (dy < 0 && panel.scrollTop <= 0)) event.preventDefault();
          return;
        }
        if (current === 'full' && (dy > 0 || panel.scrollTop > 0)) {
          wheel.native = true;
          return;
        }
        event.preventDefault();
        if (Math.sign(wheel.sum) !== Math.sign(dy)) wheel.sum = 0;
        wheel.sum += dy;
        if (Math.abs(wheel.sum) < THRESHOLD) return;
        wheel.locked = true;
        if (current === 'half' && dy > 0) expand();
        else collapse();
      }, { passive: false });

      listen(panel, 'scroll', () => {
        if (current === 'half' && panel.scrollTop > 0) expand();
      }, { passive: true });
      listen(panel, 'keydown', event => {
        if (current !== 'half' || event.defaultPrevented || isInteractive(event.target)) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (['PageDown', 'ArrowDown', ' '].includes(event.key)) {
          event.preventDefault();
          expand();
        }
      });

      return {
        get level() { return current; },
        expand,
        collapse,
        dispose() {
          if (disposed) return;
          disposed = true;
          pointer = touch = wheel = null;
          removers.splice(0).forEach(remove => remove());
        },
      };
    },
  };
})();
