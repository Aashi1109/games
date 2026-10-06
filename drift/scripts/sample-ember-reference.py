"""Read reference pixels into vertex-paint measurements; does not edit the image."""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
image = Image.open(ROOT / 'output/models/reference.png').convert('RGB')
x0, y0, x1, y1 = 145, 82, 244, 245
rgb = [channel for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)
       for channel in image.getpixel((x, y))]
data = {'x': x0, 'y': y0, 'width': x1 - x0 + 1, 'height': y1 - y0 + 1, 'rgb': rgb}
(ROOT / 'client/ember-reference-paint.js').write_text(
    '// sRGB color measurements from the approved concept, used as vertex paint.\n'
    + 'export const EMBER_PAINT = ' + json.dumps(data, separators=(',', ':')) + ';\n')
