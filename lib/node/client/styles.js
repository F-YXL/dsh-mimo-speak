/**
 * Plugin-owned stylesheet.
 *
 * The in-repo client bundles compile CSS Modules through their tsdown preset;
 * this out-of-tree plugin keeps one plain stylesheet and injects it with the
 * same shape the platform's own bundle loader uses (a `data-plugin-css` style
 * tag owned by the plugin's effect lifetime). Class names are namespaced
 * `mimo-speak-`, and colors/radii ride the shared `--dsw-*` design tokens so both
 * themes stay correct without owning theme state.
 * @module dsh-mimo-speak/client/styles
 */
/** The plugin's stylesheet text. */
export const CSS = `
.mimo-speak-root { position: relative; display: inline-flex; align-items: center; }

.mimo-speak-button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 6px;
  border: none; border-radius: var(--dsw-radius-sm);
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.mimo-speak-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.mimo-speak-button:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.mimo-speak-button[aria-pressed="true"] { color: var(--dsw-alias-brand-primary); }

.mimo-speak-failure {
  display: inline-flex; align-items: center; color: var(--dsw-alias-label-error);
  cursor: default;
}

/* Synthesizing: the button itself pulses, so the wait is legible with no panel. */
.mimo-speak-buttonBusy {
  color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  animation: mimo-speak-pulse 1.4s ease-in-out infinite;
}
@keyframes mimo-speak-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

.mimo-speak-spin { display: inline-flex; animation: mimo-speak-spin 1.1s linear infinite; }
@keyframes mimo-speak-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.mimo-speak-panel {
  position: absolute; top: 50%; left: 100%; transform: translateY(-50%); margin-left: 4px; z-index: 40;
  display: block; width: 280px; padding: 8px 10px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
}
.mimo-speak-panelLeft { left: auto; right: 100%; margin-left: 0; margin-right: 4px; }

.mimo-speak-bar { display: flex; align-items: center; gap: 8px; height: 24px; }
/* Transport-only variant: no track and no clock, so the panel stays one control. */
.mimo-speak-barCompact { gap: 0; justify-content: flex-start; }

.mimo-speak-barButton {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0;
  border: none; border-radius: var(--dsw-radius-xs);
  background: transparent; color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.mimo-speak-barButton:hover { background: var(--dsw-alias-interactive-bg-hover); }

.mimo-speak-track {
  position: relative; flex: 1 1 auto; height: 14px; cursor: pointer;
  display: flex; align-items: center; touch-action: none;
}
.mimo-speak-track::before {
  content: ""; position: absolute; left: 0; right: 0; height: 4px;
  background: var(--dsw-alias-border-l3); border-radius: 2px;
}
.mimo-speak-track:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary); outline-offset: 2px; border-radius: var(--dsw-radius-xs); }

/* Streaming playback cannot seek: the track becomes a progress readout with
   no thumb and no pointer affordance. */
.mimo-speak-trackStatic { cursor: default; }
.mimo-speak-trackStatic .mimo-speak-thumb { display: none; }

.mimo-speak-fill {
  position: absolute; left: 0; height: 4px; max-width: 100%;
  background: var(--dsw-alias-brand-primary); border-radius: 2px;
}

.mimo-speak-thumb {
  position: absolute; width: 10px; height: 10px; margin-left: -5px;
  background: var(--dsw-alias-brand-primary); border-radius: 50%;
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-2);
}
.mimo-speak-trackDragging .mimo-speak-thumb { transform: scale(1.2); }

.mimo-speak-time {
  flex: 0 0 auto; font-size: 11px; line-height: 1;
  color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mimo-speak-audition { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.mimo-speak-auditionHint {
  margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary);
}
.mimo-speak-auditionRow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.mimo-speak-auditionRow .mimo-speak-bar { flex: 1 1 220px; min-width: 180px; }
.mimo-speak-auditionButton {
  height: 28px; padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-button-tool-bar-fill);
  color: var(--dsw-alias-label-primary);
  font-size: 12px; cursor: pointer;
}
.mimo-speak-auditionButton:hover:not(:disabled) { background: var(--dsw-alias-button-tool-bar-hover); }
.mimo-speak-auditionButton:disabled { opacity: 0.6; cursor: default; }

.mimo-speak-fieldError { margin: 0; font-size: 12px; color: var(--dsw-alias-label-error); }

/* Preset-voice dropdown, styled to sit inside the shared settings form frame
   like the primitive text fields around it. */
.mimo-speak-selectField { display: flex; flex-direction: column; gap: 6px; }
.mimo-speak-selectLabel { font-size: 13px; font-weight: 500; line-height: 18px; color: var(--dsw-alias-label-primary); }
.mimo-speak-select {
  height: 34px; padding: 0 10px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.mimo-speak-select:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.mimo-speak-select:disabled { opacity: 0.6; cursor: default; }

/* Section titles inside the configuration card. */
.mimo-speak-sectionTitle {
  margin: 16px 0 0; padding-top: 12px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  font-size: 12px; font-weight: 600; letter-spacing: 0.02em;
  color: var(--dsw-alias-label-secondary); text-transform: uppercase;
}
.mimo-speak-sectionTitle:first-child { margin-top: 0; padding-top: 0; border-top: none; }

/* Status lines inside the floating player panel. */
.mimo-speak-panelStatus { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-error); }
.mimo-speak-panelNote { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }

/* While a player is open, the message's action strip stays visible even when
   the pointer leaves the row — audio must not fade out mid-playback. The
   selector reads ui-chat's reveal attribute as a progressive enhancement: with
   the attribute absent the rule simply never matches. */
@media (hover: hover) {
  [data-actions-reveal="hover"]:has(.mimo-speak-open) .actions { opacity: 1; }
}

.mimo-speak-recordingsPage { display: flex; flex-direction: column; }
.mimo-speak-recordingsSection {
  margin-top: 20px; padding-top: 16px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.mimo-speak-recordingsTitle { margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mimo-speak-recordingsHintText { margin: 0 0 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.mimo-speak-recordingsEmpty { margin: 4px 0; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.mimo-speak-recording { padding: 10px 0; border-top: 1px solid var(--dsw-alias-border-l3); }
.mimo-speak-recording:first-of-type { border-top: none; }
.mimo-speak-recordingText {
  margin: 0 0 6px; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-primary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.mimo-speak-versions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.mimo-speak-version { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.mimo-speak-versionAudio { height: 32px; flex: 1 1 200px; min-width: 160px; }
.mimo-speak-versionMeta { font-size: 11px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.mimo-speak-recButton {
  height: 26px; padding: 0 12px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-button-tool-bar-fill); color: var(--dsw-alias-label-primary);
}
.mimo-speak-recButton:hover:not(:disabled) { background: var(--dsw-alias-button-tool-bar-hover); }
.mimo-speak-recButton:disabled { opacity: 0.6; cursor: default; }
`;
/**
 * Inject the plugin stylesheet into the page.
 * @returns the disposer removing the style tag (HMR-safe: re-injection after a
 * rebuild replaces the tag by its data attribute).
 */
export function injectStyles() {
    const existing = document.querySelector('style[data-plugin-css="dsh-mimo-speak/styles"]');
    if (existing !== null)
        return () => { existing.remove(); };
    const tag = document.createElement('style');
    tag.dataset.plugin = 'dsh-mimo-speak';
    tag.dataset.pluginCss = 'dsh-mimo-speak/styles';
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => { tag.remove(); };
}
//# sourceMappingURL=styles.js.map