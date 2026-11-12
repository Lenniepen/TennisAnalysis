# Export the WASB (HRNet) tennis ball model (NTT, MIT license) to ONNX for onnxruntime-web.
# Input: 1x9x288x512 (3 RGB frames, ImageNet-normalised); output: 1x3x288x512 heatmaps (sigmoid applied).
import sys, os, torch, yaml
SRC = os.path.join(os.path.dirname(__file__), '..', 'WASB-SBDT', 'src')
sys.path.append(os.path.abspath(SRC))
from models import build_model

from omegaconf import OmegaConf  # the model code reads the config with attribute access (cfg.MODEL.EXTRA)
cfg = OmegaConf.create({'model': yaml.safe_load(open(os.path.join(SRC, 'configs', 'model', 'wasb.yaml')))})
model = build_model(cfg)
ck = torch.load(sys.argv[1], map_location='cpu', weights_only=False)
sd = ck.get('model_state_dict', ck.get('state_dict', ck))
sd = {k.replace('module.', '', 1): v for k, v in sd.items()}
missing, unexpected = model.load_state_dict(sd, strict=False)
print('missing', len(missing), missing[:5], 'unexpected', len(unexpected), unexpected[:5])
model.eval()

class Wrap(torch.nn.Module):
    def __init__(s, m): super().__init__(); s.m = m
    def forward(s, x):
        y = s.m(x)
        if isinstance(y, dict): y = y[0]
        return torch.sigmoid(y)

w = Wrap(model)
x = torch.randn(1, 9, 288, 512)
with torch.no_grad(): print('out', w(x).shape)
torch.onnx.export(w, x, sys.argv[2], input_names=['frames'], output_names=['heatmaps'], opset_version=17, dynamo=False)
print('saved', sys.argv[2], os.path.getsize(sys.argv[2]))
