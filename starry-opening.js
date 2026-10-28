(() => {
    const experience = document.getElementById('starry-experience');
    if (!experience) return;

    const opening = window.StarryOpeningScene;
    const transition = window.StarryTransitionScene;
    const river = window.StarryRiverScene;
    const TRANSITION_DURATION = 3000;
    let scene = 'opening';
    let transitionTimer = null;

    function lockPage(locked) {
        document.body.classList.toggle('starry-lock', locked);
    }

    function setScene(nextScene) {
        window.clearTimeout(transitionTimer);
        scene = nextScene;
        experience.dataset.scene = nextScene;
        experience.classList.toggle('is-transitioning', nextScene === 'transition');
        experience.classList.toggle('is-river', nextScene === 'river');

        if (nextScene === 'opening') {
            lockPage(true);
            transition?.deactivate();
            river?.deactivate();
            opening?.restart();
            return;
        }

        if (nextScene === 'transition') {
            lockPage(true);
            opening?.deactivate();
            river?.deactivate();
            transition?.activate();
            transitionTimer = window.setTimeout(() => setScene('river'), TRANSITION_DURATION);
            return;
        }

        opening?.deactivate();
        transition?.deactivate();
        river?.activate();
        lockPage(false);
        window.dispatchEvent(new CustomEvent('starry:unlocked'));
    }

    window.addEventListener('starry:opening-enter', () => {
        if (scene === 'opening') setScene('transition');
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && scene !== 'opening') setScene('opening');
    });

    window.addEventListener('pagehide', () => {
        window.clearTimeout(transitionTimer);
    }, { once: true });

    window.__STARRY_RIVER__ = Object.freeze({
        get scene() { return scene; },
        setScene
    });
})();
