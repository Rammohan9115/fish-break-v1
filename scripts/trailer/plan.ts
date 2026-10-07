// Cut list + ffmpeg filter scripts for scripts/trailer/edit.sh, derived from scenes.ts so timing lives in one place.
//   tsx scripts/trailer/plan.ts video <out-file>   xfade chain over clips/<scene>.mp4 (inputs in scene order)
//   tsx scripts/trailer/plan.ts audio <out-file> <sfx-dir>   sfx delays + music mix (inputs: music.wav, then one per cue)
//   tsx scripts/trailer/plan.ts info                prints scene start times / total
import fs from 'node:fs';
import { OVERLAP_FRAMES, scenes } from './scenes';

const FPS = 60;
const X = OVERLAP_FRAMES / FPS;
const cut = scenes.filter((s) => !s.extra);
const starts: number[] = [];
cut.reduce((t, s) => (starts.push(t), t + s.dur), 0);
const total = cut.reduce((t, s) => t + s.dur, 0);
const cmd = process.argv[2];

if (cmd === 'info') {
  console.log(JSON.stringify({ total, scenes: cut.map((s, i) => ({ id: s.id, start: starts[i], dur: s.dur, out: s.out ?? 'fade', frames: Math.round(s.dur * FPS) + OVERLAP_FRAMES })) }, null, 1));
} else if (cmd === 'video') {
  // clip i is dur_i + X long; the join into clip i happens at the end of clip i-1's own duration.
  const lines: string[] = [];
  let prev = '[0:v]';
  for (let i = 1; i < cut.length; i++) {
    const kind = cut[i - 1]!.out === 'whip' ? 'slideleft' : 'fade';
    const d = kind === 'slideleft' ? X : X;
    const label = i === cut.length - 1 ? '[joined]' : `[x${i}]`;
    lines.push(`${prev}[${i}:v]xfade=transition=${kind}:duration=${d.toFixed(4)}:offset=${starts[i]!.toFixed(4)}${label}`);
    prev = label;
  }
  lines.push(`[joined]trim=duration=${total},setpts=PTS-STARTPTS,fade=t=in:st=0:d=0.3,fade=t=out:st=${(total - 0.5).toFixed(3)}:d=0.5[v]`);
  fs.writeFileSync(process.argv[3]!, lines.join(';\n'));
} else if (cmd === 'audio') {
  const cues: { at: number; name: string; gain: number }[] = [];
  cut.forEach((s, i) => s.sfx.forEach((q) => cues.push({ at: starts[i]! * 1000 + q.at, name: q.name, gain: q.gain ?? 1 })));
  cues.sort((a, b) => a.at - b.at);
  const lines: string[] = [];
  // Music gets a gentle breath-in and fades out over the last 1.5 s.
  lines.push(`[0:a]atrim=0:${total},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.8,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5,volume=1.0[music]`);
  const labels = ['[music]'];
  cues.forEach((q, i) => {
    lines.push(`[${i + 1}:a]adelay=${Math.round(q.at)}|${Math.round(q.at)},volume=${(0.5 * q.gain).toFixed(2)}[s${i}]`);
    labels.push(`[s${i}]`);
  });
  lines.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first:dropout_transition=0,atrim=0:${total},asetpts=PTS-STARTPTS[a]`);
  fs.writeFileSync(process.argv[3]!, lines.join(';\n'));
  fs.writeFileSync(`${process.argv[3]}.inputs`, cues.map((q) => `${process.argv[4]}/${q.name}.wav`).join('\n'));
} else {
  console.error('usage: plan.ts video|audio|info');
  process.exit(1);
}
