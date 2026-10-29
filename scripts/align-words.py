# /// script
# requires-python = ">=3.12"
# dependencies = ["torch==2.6.0", "torchaudio==2.6.0", "numpy>=2,<3"]
# ///
"""Force-align authored English words to source clips; never processes learner takes.
Run: uv run --python 3.12 scripts/align-words.py [pack slug ...]
"""
import json
import re
import subprocess
import sys
from pathlib import Path

if '--help' in sys.argv:
    print(__doc__)
    raise SystemExit(0)

import numpy as np
import torch
import torchaudio

torch.set_num_threads(4)
bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
model = bundle.get_model(dl_kwargs={'progress': False}).eval()
labels = {char: index for index, char in enumerate(bundle.get_labels())}
for slug in sys.argv[1:] or ['patrick', 'chocolate', 'wumbo', 'onions', 'sintel']:
    folder = Path('public/packs') / slug
    pack = json.loads((folder / 'pack.json').read_text())
    source = Path('content/media/sintel' if slug == 'sintel' else 'content/local-dubbing') / pack['video']
    audio = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source), '-vn', '-ac', '1', '-ar', str(bundle.sample_rate), '-f', 'f32le', 'pipe:1'])
    pcm = np.frombuffer(audio, dtype='<f4').copy()
    for line in pack['lines']:
        words = line['text'].split()
        normalized = [re.sub("[^A-Z']", '', w.upper()) for w in words]
        if not all(normalized):
            raise ValueError(f'{slug}: each word must contain English letters')
        text = '|'.join(normalized)
        samples = torch.from_numpy(pcm[round(line['start'] * bundle.sample_rate):round(line['end'] * bundle.sample_rate)]).unsqueeze(0)
        with torch.inference_mode():
            logits, _ = model(samples)
            emission = logits.log_softmax(-1)
            target = torch.tensor([[labels[c] for c in text]], dtype=torch.int32)
            alignment, scores = torchaudio.functional.forced_align(emission, target, blank=0)
            spans = torchaudio.functional.merge_tokens(alignment[0], scores[0].exp())
        if len(spans) != len(text):
            raise ValueError(f'{slug}: unexpected token count')
        ratio = samples.shape[1] / logits.shape[1] / bundle.sample_rate
        index = 0
        timings = []
        for word, normalized_word in zip(words, normalized):
            first, last = spans[index], spans[index + len(normalized_word) - 1]
            timings.append(dict(text=word, start=round(line['start'] + first.start * ratio, 3), end=round(min(line['end'], line['start'] + last.end * ratio), 3)))
            index += len(normalized_word) + 1
        if any(w['end'] <= w['start'] for w in timings):
            raise ValueError(f'{slug}: alignment needs review: {timings}')
        line['words'] = timings
        print(slug, line['text'], timings, flush=True)
    pack['wordTiming'] = {'method': 'CTC forced alignment', 'tool': 'torchaudio 2.6.0', 'model': 'WAV2VEC2_ASR_BASE_960H', 'language': 'en'}
    (folder / 'pack.json').write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
