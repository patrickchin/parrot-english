# /// script
# requires-python = ">=3.9"
# dependencies = ["pillow>=11,<12"]
# ///
"""Author reviewed avatars: uv run scripts/prepare-portraits.py.

Standalone artwork/publicity portraits for main characters; reviewed video crops
for minor roles. Media stays in the ignored authoring directory and OSS.
"""
import hashlib
import io
import json
import pathlib
import subprocess

from PIL import Image, ImageChops, ImageEnhance, ImageOps

repo = pathlib.Path(__file__).resolve().parents[1]
local = repo / 'content/local-dubbing'
sources = local / 'character-artwork'
sources.mkdir(parents=True, exist_ok=True)
recipes = json.loads((repo / 'content/character-avatars.json').read_text())
size = recipes['size']
prepared = {}

for avatar in recipes['avatars']:
    key = avatar['key']
    if avatar['kind'] == 'video-still':
        # Coordinates are reviewed after scaling the video to 480px wide.
        frame = subprocess.check_output([
            'ffmpeg', '-v', 'error', '-ss', str(avatar['time']), '-i',
            str(local / avatar['video']), '-frames:v', '1', '-vf', 'scale=480:-2',
            '-f', 'image2pipe', '-vcodec', 'png', '-',
        ])
        image = Image.open(io.BytesIO(frame)).convert('RGBA')
        x, y, width = avatar['frameCrop']
        image = image.crop((x, y, x + width, y + width))
    else:
        original = sources / avatar['file']
        if not original.exists():
            subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '60',
                            avatar['image'], '-o', str(original)], check=True)
        if original.suffix == '.svg':
            # Rasterize the official vector using the project's existing browser.
            raster = sources / (key + '-raster.png')
            subprocess.run(['node', '--input-type=module', '-e', '''
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(await readFile(process.argv[1], 'utf8'));
  await page.locator('svg').evaluate(svg => {
    svg.style.width = '512px'; svg.style.height = '512px';
  });
  await page.locator('svg').screenshot({ path: process.argv[2], omitBackground: true });
} finally { await browser.close(); }
''', str(original), str(raster)], cwd=repo, check=True)
            image = Image.open(raster).convert('RGBA')
        else:
            image = Image.open(original).convert('RGBA')
        # Trim transparent/white padding before applying the reviewed crop.
        white = Image.new('RGBA', image.size, 'white')
        white.alpha_composite(image)
        box = ImageChops.difference(white.convert('RGB'), Image.new('RGB', image.size, 'white')).getbbox()
        if box:
            image = image.crop(box)
        if 'crop' in avatar:
            l, t, r, b = avatar['crop']
            image = image.crop((round(l * image.width), round(t * image.height),
                                round(r * image.width), round(b * image.height)))

    if 'brightness' in avatar:
        image = ImageEnhance.Brightness(image).enhance(avatar['brightness'])
    image = ImageOps.contain(image, (size - 8, size - 8), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), '#f4f3ee')
    canvas.alpha_composite(image, ((size - image.width) // 2, (size - image.height) // 2))
    output = io.BytesIO()
    canvas.convert('RGB').save(output, 'JPEG', quality=91, optimize=True)
    data = output.getvalue()
    filename = f"{key}-avatar-{hashlib.sha256(data).hexdigest()[:12]}.jpg"
    (local / filename).write_bytes(data)
    prepared[key] = filename

uploads = []
catalogue = json.loads((repo / 'src/review-clips.json').read_text())
for entry in catalogue:
    slug = entry['slug']
    path = repo / f'public/scenes/{slug}/scene.json'
    scene = json.loads(path.read_text())
    for role in scene['roles']:
        if role.get('selectable') is False or role['name'] == '\u6765\u7535\u8005':
            continue  # The unseen caller uses the phone symbol in the player.
        matches = [a for a in recipes['avatars'] if a['name'] == role['name']
                   and ('scenes' not in a or slug.startswith(a['scenes']))]
        if len(matches) != 1:
            raise ValueError(f"Expected one reviewed avatar: {slug} / {role['name']}")
        filename = prepared[matches[0]['key']]
        role['portrait'] = filename
        uploads.append({'file': str((local / filename).relative_to(repo)),
                        'key': f'clips/{slug}/{filename}'})
    path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + '\n')
(local / 'avatar-uploads.json').write_text(json.dumps(uploads, indent=2) + '\n')
print(f"Prepared {len(prepared)} avatars and {len(uploads)} OSS uploads; upload before releasing manifests.")
