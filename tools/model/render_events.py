# Overlay video: ball points of the AI model (yellow + trail), fitted 3D flights (thin white), bounces (green in / red out,
# dashed = predicted), hits (white cross + km/h and contact height), serve info.
# usage: python render_events.py video.mp4 events.json out.mp4
import sys, json, cv2, math
video, evf, out = sys.argv[1:4]
E = json.load(open(evf))
cap = cv2.VideoCapture(video); fps = cap.get(5); W = int(cap.get(3)); H = int(cap.get(4))
ow, oh = 1280, int(H * 1280 / W)
wr = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*'mp4v'), fps, (ow, oh))
P = lambda x, y: (int(x * ow), int(y * oh))
def label(f, txt, p, col):
    (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
    x, y = p[0] + 12, p[1] - 12
    cv2.rectangle(f, (x - 4, y - th - 5), (x + tw + 4, y + 5), (20, 20, 20), -1)
    cv2.putText(f, txt, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 1, cv2.LINE_AA)
i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    t = i / fps; i += 1
    f = cv2.resize(f, (ow, oh), interpolation=cv2.INTER_AREA)
    for cu in E['curves']:
        seg = [P(q[1], q[2]) for q in cu if t - 1.2 <= q[0] <= t]
        for a, b in zip(seg, seg[1:]): cv2.line(f, a, b, (235, 235, 235), 1, cv2.LINE_AA)
    trail = [p for p in E['pts'] if t - 0.5 <= p['t'] <= t + 1e-3]
    for p in trail: cv2.circle(f, P(p['x'], p['y']), 3, (0, 210, 255), -1)
    if trail and t - trail[-1]['t'] < 0.05: cv2.circle(f, P(trail[-1]['x'], trail[-1]['y']), 9, (0, 230, 255), 2)
    for b in E['bounces']:
        if not (b['t'] <= t <= b['t'] + 2.5) or b['x'] != b['x']: continue
        col = (90, 220, 90) if b['call'] == 'in' else (80, 80, 240)
        c = P(b['x'], b['y'])
        if b['pred']:
            for k in range(0, 360, 40): cv2.ellipse(f, c, (12, 7), 0, k, k + 20, col, 2)
        else: cv2.ellipse(f, c, (12, 7), 0, 0, 360, col, 2)
        if t - b['t'] < 1.2: label(f, ('stuit ' + b['call']) + (' (voorspeld)' if b['pred'] else ''), c, col)
    for h in E['hits']:
        if not (h['t'] <= t <= h['t'] + 2.0): continue
        c = P(h['x'], h['y']); s = 7
        cv2.line(f, (c[0] - s, c[1] - s), (c[0] + s, c[1] + s), (255, 255, 255), 2); cv2.line(f, (c[0] + s, c[1] - s), (c[0] - s, c[1] + s), (255, 255, 255), 2)
        if t - h['t'] < 1.5: label(f, f"{h.get('type', 'slag')}  {h['kmh']} km/u, raakhoogte {h['z']:.1f} m".replace('.', ','), c, (255, 255, 255))
    s = E.get('serve')
    if s and s['t'] - 0.2 <= t <= s['t'] + 3:
        j = E.get('judge') or {}
        txt = f"service {round(s['kmh'])} km/u | raakpunt {s['contact'][2]:.2f} m | net +{round(s['net']['clear']*100)} cm".replace('.', ',') if s.get('net') else f"service {round(s['kmh'])} km/u"
        label(f, txt + (f" | {j.get('zone','')}" if j.get('zone') else ''), (20, 50), (255, 230, 120))
    cv2.rectangle(f, (10, oh - 36), (470, oh - 10), (0, 0, 0), -1)
    cv2.putText(f, f'{t:5.2f} s   AI-balmodel + 3D (gravitatie, lucht, spin)', (16, oh - 17), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    wr.write(f)
wr.release(); print('frames', i)
