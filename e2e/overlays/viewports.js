// The screens every overlay must work on. `zoom` > 1 emulates browser zoom: the CSS viewport shrinks by the factor and
// devicePixelRatio grows (what media queries, dvh and the canvas see).
const base = [
  { id: 'p360x640', w: 360, h: 640, touch: true },
  { id: 'p375x667', w: 375, h: 667, touch: true },
  { id: 'p390x844', w: 390, h: 844, touch: true },
  { id: 'p430x932', w: 430, h: 932, touch: true },
  { id: 'l844x390', w: 844, h: 390, touch: true },
  { id: 'l667x375', w: 667, h: 375, touch: true },
  { id: 't820x1180', w: 820, h: 1180, touch: true },
  { id: 't1180x820', w: 1180, h: 820, touch: true },
  { id: 'd1280x720', w: 1280, h: 720 },
  { id: 'd1366x768', w: 1366, h: 768 },
  { id: 'd1440x900', w: 1440, h: 900 },
  { id: 'd1920x1080', w: 1920, h: 1080 },
  { id: 'd2560x1440', w: 2560, h: 1440 },
];
const zoomed = [];
for (const [w, h] of [[1366, 768], [1920, 1080]]) {
  for (const zoom of [1.25, 1.5, 2]) {
    zoomed.push({ id: `d${w}x${h}@${Math.round(zoom * 100)}`, w: Math.round(w / zoom), h: Math.round(h / zoom), zoom });
  }
}

module.exports = { VIEWPORTS: [...base, ...zoomed] };
