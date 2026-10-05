import type { BreathState } from '../breathing/BreathEngine.js';
import type { SessionState } from './SessionController.js';
import {
  ExperienceController,
  type ExperiencePhase,
} from './ExperienceController.js';

const TARGET_CYCLES = 8;

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);

  if (className != null) {
    element.className = className;
  }

  return element;
}

function getPhaseLabel(phase: ExperiencePhase): string {
  switch (phase) {
    case 'ready':
      return 'Ready';
    case 'running':
      return 'Breathing';
    case 'paused':
      return 'Paused';
    case 'complete':
      return 'Complete';
  }
}

export class DesktopControls {
  private readonly root = createElement(
    'section',
    'resonance-reef-controls',
  );
  private readonly status = createElement('div', 'rr-status');
  private readonly progress = createElement('div', 'rr-progress');
  private readonly primaryButton = createElement(
    'button',
    'rr-button rr-primary',
  );
  private readonly pauseButton = createElement(
    'button',
    'rr-button',
  );
  private readonly restartButton = createElement(
    'button',
    'rr-button',
  );
  private readonly muteButton = createElement(
    'button',
    'rr-button rr-icon',
  );

  constructor(
    private readonly controller: ExperienceController,
  ) {
    this.installStyles();

    const title = createElement('div', 'rr-title');
    const actions = createElement('div', 'rr-actions');

    title.textContent = 'Resonance Reef';
    this.root.setAttribute('aria-label', 'Experience controls');

    this.primaryButton.type = 'button';
    this.pauseButton.type = 'button';
    this.restartButton.type = 'button';
    this.muteButton.type = 'button';

    this.primaryButton.addEventListener('click', () => {
      const { phase } = this.controller.getState();

      if (phase === 'paused') {
        this.controller.resume();
      } else if (phase === 'complete') {
        this.controller.restart();
      } else {
        this.controller.start();
      }
    });

    this.pauseButton.addEventListener('click', () => {
      this.controller.pause();
    });

    this.restartButton.addEventListener('click', () => {
      this.controller.restart();
    });

    this.muteButton.addEventListener('click', () => {
      this.controller.toggleMuted();
    });

    actions.append(
      this.primaryButton,
      this.pauseButton,
      this.restartButton,
      this.muteButton,
    );
    this.root.append(
      title,
      this.status,
      this.progress,
      actions,
    );
    document.body.append(this.root);
  }

  update(
    breath: BreathState,
    session: SessionState,
  ): void {
    const { muted, phase } =
      this.controller.getState();
    const breathNumber =
      phase === 'complete'
        ? TARGET_CYCLES
        : Math.min(
            TARGET_CYCLES,
            session.completedCycles + 1,
          );

    this.status.textContent = getPhaseLabel(phase);
    this.progress.textContent =
      phase === 'ready'
        ? 'Breath 1 of 8'
        : `Breath ${breathNumber} of 8 - ${breath.phase}`;

    this.primaryButton.hidden = phase === 'running';
    this.primaryButton.textContent =
      phase === 'paused'
        ? 'Resume'
        : phase === 'complete'
          ? 'Breathe Again'
          : 'Start Experience';

    this.pauseButton.hidden = phase !== 'running';
    this.pauseButton.textContent = 'Pause';

    this.restartButton.hidden =
      phase === 'ready' || phase === 'complete';
    this.restartButton.textContent = 'Restart';

    this.muteButton.textContent = muted
      ? 'Unmute'
      : 'Mute';
    this.muteButton.setAttribute(
      'aria-pressed',
      muted ? 'true' : 'false',
    );
  }

  dispose(): void {
    this.root.remove();
  }

  private installStyles(): void {
    if (document.getElementById('resonance-reef-controls-style')) {
      return;
    }

    const style = document.createElement('style');

    style.id = 'resonance-reef-controls-style';
    style.textContent = `
      .resonance-reef-controls {
        position: fixed;
        left: 16px;
        top: 16px;
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 8px;
        box-sizing: border-box;
        width: min(320px, calc(100vw - 32px));
        padding: 12px;
        border: 1px solid rgba(141, 221, 231, 0.28);
        border-radius: 8px;
        background: rgba(5, 22, 30, 0.78);
        color: #e9fbff;
        font: 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        backdrop-filter: blur(10px);
      }

      .rr-title {
        font-weight: 700;
        letter-spacing: 0;
      }

      .rr-status {
        color: #8ddde7;
        font-weight: 600;
      }

      .rr-progress {
        color: rgba(233, 251, 255, 0.8);
        font-size: 13px;
      }

      .rr-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .rr-button {
        min-height: 34px;
        border: 1px solid rgba(141, 221, 231, 0.38);
        border-radius: 6px;
        background: rgba(12, 57, 68, 0.86);
        color: #e9fbff;
        cursor: pointer;
        font: inherit;
        font-weight: 650;
        padding: 6px 10px;
      }

      .rr-button:hover,
      .rr-button:focus-visible {
        background: rgba(26, 91, 103, 0.94);
        outline: 2px solid rgba(141, 221, 231, 0.56);
        outline-offset: 1px;
      }

      .rr-primary {
        background: rgba(64, 178, 184, 0.9);
        color: #052029;
      }
    `;
    document.head.append(style);
  }
}
