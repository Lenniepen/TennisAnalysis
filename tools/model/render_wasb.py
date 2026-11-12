# Draw WASB detections on the video: yellow dot = ball now, fading trail = last 0.6 s; optional app tracks in cyan.
# usage: python render_wasb.py video.mp4 wasb.json out.mp4 [app_dbg.json]
import sys, json, cv2
video, det, out = sys.argv[1:4]
app = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
D = json.load(open(det))['frames']
cap = cv2.VideoCapture(video); fps = cap.get(5); W = int(cap.get(3)); H = int(cap.get(4))
ow, oh = 1280, int(H * 1280 / W); s = ow / W
wr = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*'mp4v'), fps, (ow, oh))
apts = [p for tr in app['tracks'] for p in tr['pts']] if app else []
i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    t = i / fps; i += 1
    f = cv2.resize(f, (ow, oh), interpolation=cv2.INTER_AREA)
    if apts:
        for p in apts:
            if t - 0.6 <= p['t'] <= t: cv2.circle(f, (int(p['x'] * ow), int(p['y'] * oh)), 3, (255, 255, 0), -1)
    for fr in D:
        dt = t - fr['t']
        if 0 <= dt <= 0.6:
            for d in fr['d']:
                c = (int(d['x'] * ow), int(d['y'] * oh))
                if dt < 0.03: cv2.circle(f, c, 9, (0, 230, 255), 2)
                else: cv2.circle(f, c, 3, (0, 200, 255), -1)
    cv2.rectangle(f, (10, oh - 40), (560, oh - 10), (0, 0, 0), -1)
    cv2.putText(f, f'{t:5.2f} s  geel = AI-model (WASB)' + ('  cyaan = oude detector' if apts else ''), (18, oh - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    wr.write(f)
wr.release(); print('frames', i)
