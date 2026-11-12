# Run the WASB ONNX tennis model over a video; write detections per frame (normalised full-image coords).
# usage: python run_wasb.py model.onnx video.mp4 out.json [crop x0,y0,x1,y1 in px (16:9)] [t0] [t1]
import sys, json, time, numpy as np, cv2, onnxruntime as ort
model, video, out = sys.argv[1:4]
crop = [int(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 and sys.argv[4] != '-' else None
t0 = float(sys.argv[5]) if len(sys.argv) > 5 else 0; t1 = float(sys.argv[6]) if len(sys.argv) > 6 else 1e9
sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
cap = cv2.VideoCapture(video); fps = cap.get(5); W = int(cap.get(3)); H = int(cap.get(4))
x0, y0, x1, y1 = crop if crop else (0, 0, W, H)
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)
def prep(f):
    f = cv2.resize(f[y0:y1, x0:x1], (512, 288), interpolation=cv2.INTER_AREA)
    f = cv2.cvtColor(f, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.
    return ((f - mean) / std).transpose(2, 0, 1)
frames, ts, res = [], [], []
cap.set(cv2.CAP_PROP_POS_MSEC, t0 * 1000)
tt = time.time(); n = 0
while True:
    ok, f = cap.read()
    if not ok: break
    t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000 - 1 / fps
    if t > t1: break
    frames.append(prep(f)); ts.append(t)
    if len(frames) < 3: continue
    if len(frames) > 3: frames.pop(0); ts.pop(0)
    hm = sess.run(None, {'frames': np.concatenate(frames, 0)[None]})[0][0, 1]  # middle frame
    n += 1; dets = []
    if hm.max() > 0.5:
        k, lab = cv2.connectedComponents((hm > 0.5).astype(np.uint8))
        for m in range(1, k):
            ys, xs = np.where(lab == m); w = hm[ys, xs]
            cx = (xs * w).sum() / w.sum(); cy = (ys * w).sum() / w.sum()
            dets.append({'x': round((x0 + (cx + 0.5) / 512 * (x1 - x0)) / W, 4), 'y': round((y0 + (cy + 0.5) / 288 * (y1 - y0)) / H, 4), 's': round(float(w.sum()), 2)})
    res.append({'t': round(ts[1], 3), 'd': dets})
el = time.time() - tt
json.dump({'fps': fps, 'W': W, 'H': H, 'crop': [x0, y0, x1, y1], 'frames': res, 'ms_per_frame': round(el / max(1, n) * 1000, 1)}, open(out, 'w'))
print('frames', n, 'with ball', sum(1 for r in res if r['d']), 'ms/frame', round(el / max(1, n) * 1000, 1))
