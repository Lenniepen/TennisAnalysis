# Compare WASB detections with the hand-checked positions and with the app's own ball tracks (punt 3)
import sys, json, math
W, H = 1920, 1080
wasb = json.load(open(sys.argv[1])); app = json.load(open(sys.argv[2]))
GT = [[6.24,915,184],[6.28,897,193],[6.32,882,201],[6.40,860,216],[6.44,851,223],[6.48,844,230],[6.52,839,236],[6.56,834,241],[6.64,826,253],[6.68,823,259],[7.48,815,173],[7.52,816,168],[7.56,817,163],[7.60,818,158],[7.64,819,153],[7.68,820,149],[7.72,821,145],[7.77,822,141]]
def near(fr, x, y, r=14): return any(math.hypot(d['x']*W-x, d['y']*H-y) < r for d in fr['d'])
F = wasb['frames']
def at(t): return min(F, key=lambda f: abs(f['t']-t))
print('GT gevonden door WASB:', sum(near(at(t), x, y) for t, x, y in GT), '/', len(GT))
pts = [p for tr in app['tracks'] for p in tr['pts']]
agree = sum(1 for p in pts if near(at(p['t']), p['x']*W, p['y']*H, 18))
print('app-trackpunten ook door WASB gezien:', agree, '/', len(pts))
# WASB frames with exactly one detection that the app track does not have nearby (new ball positions?)
appT = {}
for p in pts: appT.setdefault(round(p['t'], 2), []).append(p)
extra = [f for f in F if len(f['d']) == 1 and not any(abs(p['t']-f['t']) < 0.03 and math.hypot((p['x']-f['d'][0]['x'])*W, (p['y']-f['d'][0]['y'])*H) < 18 for p in pts)]
print('WASB-frames met 1 bal die de app niet heeft:', len(extra), ' frames met >1 detectie:', sum(1 for f in F if len(f['d']) > 1))
for a, b, nm in [(5.4, 6.25, 'opgooi+raken service'), (9.6, 9.95, 'raken 9,8 dichtbij'), (19.05, 19.4, 'raken 19,28 dichtbij'), (14.1, 14.45, 'stuit ver 14,28'), (8.8, 9.15, 'stuit dichtbij 9,0')]:
    fr = [f for f in F if a <= f['t'] <= b]; ap = [p for p in pts if a <= p['t'] <= b]
    print(f"{nm}: WASB {sum(1 for f in fr if f['d'])}/{len(fr)} beelden met bal, app {len(ap)} punten", ' '.join(f"{f['t']:.2f}:" + ('/'.join(f"{d['x']*W:.0f},{d['y']*H:.0f}" for d in f['d']) or '-') for f in fr))
