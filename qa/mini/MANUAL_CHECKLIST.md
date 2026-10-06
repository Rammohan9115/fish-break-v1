# Mini Tank: manual checklist

Playwright can open the Document PiP window and drive it (`qa/mini/drive.cjs`, `sizes.cjs`, `fallback.cjs` do), but it can't
resize the real OS window, move it over other apps, or see always-on-top behaviour. Run these by hand in Chrome or Edge
(116+) on desktop, and the last block in Firefox/Safari. Dev server: `npm run dev`.

## Open / look
- [ ] Tools tray shows **🪟 Mini Tank** (and Settings → Preferences does). On a phone or a touch-only device it is absent.
- [ ] Click it: a small window (about 400×260) appears and stays on top when you click another app.
- [ ] The main tab shows "Your tank is floating 🐠" with **Bring it back**; the HUD, shop and tools in the main tab still work.
- [ ] The tank in the window looks like the game (same fonts, colors, fish). It is the same tank: change something in the main tab (buy a fish) and it appears.
- [ ] Press **P** in the main tab: opens. Press **P** with the floating window focused: closes (back to game).
- [ ] Opening twice quickly (double-click) leaves one window.

## Resize
- [ ] Drag the window down to the smallest size (about 300×200): the fish stay sharp, nothing is clipped, the hover bar wraps to two rows, text stays readable.
- [ ] Drag it up to 800×500 or larger: the picture re-fits, no blur or stretching.
- [ ] Move it to a monitor with a different pixel density (or change the display scale): the picture stays crisp.

## Interact
- [ ] Hover: a slim bar appears with the shell count, **Feed**, sound and **↩ Back to game**; it fades when the pointer leaves.
- [ ] **Feed**: click it (it turns gold), click the water: pellets drop and fish eat. Click Feed again: back to normal.
- [ ] **Collect**: wait for or cheat a shell drop (dev panel); click the shell: the shell count rises with a "+N 🐚" chip and the coin flies to the counter.
- [ ] **Pet**: press and hold on a fish for about a quarter second; hearts appear and the fish stays put until release.
- [ ] Tap a fish quickly: no card opens in the window; a small **Open in game ↗** hint shows. Click it: the main tab's fish card opens (the tab comes to the front if the browser allows it).
- [ ] Decorate / pairing / "Try it" started in the main tab: clicking the floating tank shows the same hint and changes nothing.
- [ ] Hatch an egg (dev panel): a tiny "🐣 Hatched!" chip, no other toasts in the window.
- [ ] Sound toggle in the bar mutes and unmutes the game.

## Close
- [ ] Close with the window's **✕**: the tank is back in the main tab at the right size, no placeholder, fish and pellets intact, nothing lost.
- [ ] Open again, then **↩ Back to game**: same result.
- [ ] Open again, then **Bring it back** in the main tab: same result.
- [ ] Switch tanks in the main tab while the window is open: the floating tank changes to the new tank.
- [ ] Refresh the main tab while the window is open: the window closes and the game reloads normally with your progress.
- [ ] Open the floating window, then minimize the browser / cover the window: after restoring, nothing is stuck; fish keep swimming.

## Performance (leave it open for 10+ minutes)
- [ ] Activity Monitor / Task Manager: Chrome's total stays low (compare with the tank open normally). The window draws at most 30 frames a second.
- [ ] Switch the main tab to the background for a few minutes: the floating tank keeps animating, and shells/eggs still arrive on time.
- [ ] Sound (unmuted) keeps playing from the main page.

## Fallback: Firefox, Safari, or Chrome with the Document PiP API removed
- [ ] The button is present only where video Picture-in-Picture works; hovering it says "View-only here — use Chrome or Edge for an interactive mini tank."
- [ ] Click it: a small floating video of the tank appears. It is view-only (no clicks reach the game).
- [ ] The video keeps moving after you switch to another tab or app.
- [ ] Close the video window (or the browser's own PiP ✕): the main page is unchanged and the button works again.
- [ ] In a browser with neither API: no button anywhere.
