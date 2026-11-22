(() => {
    if (window.__tvbrowserDpad) return;

    const directions = {
        ArrowUp: [0, -1], ArrowDown: [0, 1],
        ArrowLeft: [-1, 0], ArrowRight: [1, 0]
    };
    const focusable = 'a[href],button,input,select,textarea,summary,iframe,[tabindex],[contenteditable]';
    const ownsArrows = 'input[type=range],input[type=number],input[type=radio],'
        + 'textarea,select,[contenteditable]:not([contenteditable=false]),iframe,'
        + '[role=combobox][aria-expanded=true],[role=listbox],[role=menu],[role=menubar],[role=slider],'
        + '[role=grid],[role=tree],[role=tablist],[role=radiogroup]';
    const singleLineEditor = 'input:not([type]),input[type=text],input[type=search],input[type=url],'
        + 'input[type=email],input[type=tel],input[type=password]';
    let enabled = false;
    let pendingFrame = false;

    const ring = document.createElement('div');
    ring.setAttribute('aria-hidden', 'true');
    Object.assign(ring.style, {
        position: 'fixed', zIndex: '2147483647', pointerEvents: 'none',
        display: 'none', boxSizing: 'border-box', border: '3px solid #ffdf42',
        boxShadow: '0 0 0 2px #151515', borderRadius: '3px'
    });

    function activeElement() {
        let element = document.activeElement;
        while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
        return element === document.body || element === document.documentElement ? null : element;
    }

    function visibleRect(element) {
        if (!element || !element.isConnected || element.closest('[inert],[aria-hidden=true]')) return null;
        if (getComputedStyle(element).visibility !== 'visible') return null;
        const rect = element.getBoundingClientRect();
        const left = Math.max(0, rect.left);
        const right = Math.min(innerWidth, rect.right);
        const top = Math.max(0, rect.top);
        const bottom = Math.min(innerHeight, rect.bottom);
        if (right <= left || bottom <= top) return null;
        const x = (left + right) / 2;
        const y = (top + bottom) / 2;
        const hit = (element.getRootNode().elementFromPoint?.(x, y) || document.elementFromPoint(x, y));
        if (!hit || (hit !== element && !element.contains(hit))) return null;
        return {left, right, top, bottom, x, y};
    }

    function updateRing() {
        pendingFrame = false;
        const rect = enabled && document.hasFocus() && visibleRect(activeElement());
        if (!rect) {
            ring.style.display = 'none';
            return;
        }
        if (!ring.isConnected) document.documentElement.append(ring);
        Object.assign(ring.style, {
            display: 'block', left: rect.left + 'px', top: rect.top + 'px',
            width: (rect.right - rect.left) + 'px', height: (rect.bottom - rect.top) + 'px'
        });
    }

    function scheduleRing() {
        if (pendingFrame) return;
        pendingFrame = true;
        requestAnimationFrame(updateRing);
    }

    function nearestTarget(current, dx, dy) {
        const scope = current?.closest('dialog[open],[aria-modal=true]')
            || Array.from(document.querySelectorAll('dialog[open],[aria-modal=true]'))
                .filter(visibleRect).pop()
            || current?.getRootNode() || document;
        const origin = visibleRect(current);
        let target = null;
        let bestScore = Infinity;
        for (const element of scope.querySelectorAll(focusable)) {
            if (element === current || element.matches(':disabled') || element.tabIndex < 0) continue;
            const rect = visibleRect(element);
            if (!rect) continue;
            let score;
            if (!origin) {
                score = dy > 0 ? rect.top : dy < 0 ? innerHeight - rect.bottom
                    : dx > 0 ? rect.left : innerWidth - rect.right;
            } else {
                const forward = dx * (rect.x - origin.x) + dy * (rect.y - origin.y);
                if (forward <= 1) continue;
                const gap = dx
                    ? Math.max(0, origin.top - rect.bottom, rect.top - origin.bottom)
                    : Math.max(0, origin.left - rect.right, rect.left - origin.right);
                const sideways = Math.abs(dx ? rect.y - origin.y : rect.x - origin.x);
                score = forward + gap * 3 + sideways * 0.5;
            }
            if (score < bestScore) {
                target = element;
                bestScore = score;
            }
        }
        return target;
    }

    function scrollStep(current, dx, dy) {
        const root = document.scrollingElement;
        for (let node = current?.parentElement || root; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (node !== root && !/^(auto|scroll)$/.test(dx ? style.overflowX : style.overflowY)) continue;
            const position = dx ? node.scrollLeft : node.scrollTop;
            const remaining = dx ? node.scrollWidth - node.clientWidth - position
                : node.scrollHeight - node.clientHeight - position;
            if ((dx + dy > 0 ? remaining : position) <= 1) continue;
            node.scrollBy({left: dx * 72, top: dy * 72, behavior: 'instant'});
            return true;
        }
        return false;
    }

    window.addEventListener('keydown', event => {
        if (!enabled || event.defaultPrevented || event.isComposing
                || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
                || !Object.prototype.hasOwnProperty.call(directions, event.key)) return;
        const current = activeElement();
        const [dx, dy] = directions[event.key];
        if (current?.closest(ownsArrows) || (dx && current?.matches(singleLineEditor))) return;
        const target = nearestTarget(current, dx, dy);
        if (target) {
            target.focus({preventScroll: true});
        } else if (!scrollStep(current, dx, dy) && dy < 0) {
            // Let Android return to the toolbar when WebView leaves Up unhandled.
            return;
        }
        event.preventDefault();
        scheduleRing();
    });

    for (const event of ['focus', 'blur', 'focusin', 'focusout', 'scroll', 'resize']) {
        window.addEventListener(event, scheduleRing, true);
    }
    window.__tvbrowserDpad = active => {
        enabled = active;
        scheduleRing();
    };
})();
