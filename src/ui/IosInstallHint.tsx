// iPhone Safari can't hide its address bar for web pages (no element fullscreen API).
// The only real fullscreen there is launching from the Home Screen, so tell players once, in landscape.
import { useEffect, useState } from 'react';
import { IOS_INSTALL_HINT_KEY } from '../game/constants';
import { isIOS, isStandalone, isTouchLandscape } from './fullscreen';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(IOS_INSTALL_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function IosInstallHint() {
  const eligible = isIOS() && !isStandalone();
  const [dismissed, setDismissed] = useState(dismissedBefore);
  const [landscape, setLandscape] = useState(isTouchLandscape);

  useEffect(() => {
    if (!eligible) return;
    const query = window.matchMedia('(orientation: landscape) and (pointer: coarse)');
    const onChange = () => setLandscape(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [eligible]);

  if (!eligible || dismissed || !landscape) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(IOS_INSTALL_HINT_KEY, '1');
    } catch {
      // Not critical.
    }
  };
  return (
    <div className="ios-hint" role="note">
      <span className="ios-hint-icon" aria-hidden="true">
        📲
      </span>
      <span>
        For true fullscreen on iPhone: tap <strong>Share ⬆︎</strong> then <strong>Add to Home Screen</strong>, and play from the icon.
      </span>
      <button type="button" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
