"""Render a self-contained, narrated 30-second context-denoising concept film."""

from pathlib import Path
import json
import math
import subprocess
import sys

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = Path(__file__).resolve().parent
W, H, FPS, DURATION = 1920, 1080, 30, 30
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
REG = '/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
MONO = '/System/Library/Fonts/SFNSMono.ttf'
BG, PANEL, CARD = '#0B1218', '#131F27', '#1B2C35'
WHITE, MUTED, MINT, AMBER = '#F0F6F5', '#9FB2BC', '#8DE7C5', '#FFBD88'
FONTS = {}

SCENES = [
    dict(start=0, end=3, label='CONTEXT DENOISING', title='One assumption.\nEvery next reply.',
         detail='A small drift can become\na persistent constraint.',
         caption='One assumption can steer a whole conversation.',
         voice='One assumption can steer a whole conversation.'),
    dict(start=3, end=8, label='01  /  THE BRIEF', title='The user\nsets the goal.',
         detail='An autonomous industry monitor.\nNo hosting requirement.',
         caption='Abhinav wants a system that monitors industry channels and recommends the next best action.',
         voice='Abhinav wants a system that monitors industry channels and recommends the next best action.'),
    dict(start=8, end=13, label='02  /  THE DRIFT', title='An assumption\nslips in.',
         detail='“Deploy locally” becomes\na requirement. It was never asked for.',
         caption='The assistant adds local deployment. But that requirement was never in the brief.',
         voice='The assistant adds local deployment. But that requirement was never in the brief.'),
    dict(start=13, end=18, label='03  /  NAME THE NOISE', title='Describe\nwhat went wrong.',
         detail='A targeted command\nfor a targeted correction.',
         caption='With context denoising, he names the problem: remove the local deployment assumption.',
         voice='With context denoising, he names the problem: remove the local deployment assumption.'),
    dict(start=18, end=23.5, label='04  /  REPAIR THE HISTORY', title='Update the past.\nImprove the\nnext reply.',
         detail='The saved messages change.\nThe conversation stays intact.',
         caption='The saved history is updated. Each new pass builds on those edits.',
         voice='The saved history is updated. Each new pass builds on those edits.'),
    dict(start=23.5, end=27, label='05  /  KEEP GOING', title='Continue from\ncleaner context.',
         detail='Keep the useful details.\nDrop the invented constraint.',
         caption='Now the chat continues, without that invented constraint.',
         voice='Now the chat continues, without that invented constraint.'),
    dict(start=27, end=30, label='CONTEXT DENOISING', title='Denoise the context.\nKeep the conversation.',
         detail='', caption='Cleaner context. Better next replies.',
         voice='Cleaner context. Better next replies.'),
]


def font(size, bold=False, mono=False):
    key = (size, bold, mono)
    if key not in FONTS:
        FONTS[key] = ImageFont.truetype(MONO if mono else BOLD if bold else REG, size)
    return FONTS[key]


def text(draw, xy, value, size=30, fill=WHITE, bold=False, mono=False, spacing=10):
    draw.multiline_text(xy, value, font=font(size, bold, mono), fill=fill, spacing=spacing)


def wrap(value, width, size=30, bold=False, mono=False):
    f = font(size, bold, mono)
    result = []
    for paragraph in value.split('\n'):
        line = ''
        for word in paragraph.split():
            proposed = (line + ' ' + word).strip()
            if line and f.getlength(proposed) > width:
                result.append(line)
                line = word
            else:
                line = proposed
        result.append(line)
    return '\n'.join(result)


def roundbox(draw, bounds, fill, radius=20, outline=None, width=1):
    draw.rounded_rectangle(bounds, radius=radius, fill=fill, outline=outline, width=width)


def pill(draw, x, y, value, fill='#1D3535', color=MINT, size=20, pad=16):
    width = int(font(size, True).getlength(value)) + pad * 2
    roundbox(draw, (x, y, x + width, y + 40), fill, radius=20)
    text(draw, (x + pad, y + 9), value, size, color, True)
    return width


def check(draw, x, y, color=MINT):
    draw.line([(x, y + 8), (x + 8, y + 16), (x + 24, y)], fill=color, width=4)


def background():
    yy, xx = np.mgrid[:H, :W]
    glow = np.exp(-(((xx - 1500) / 770) ** 2 + ((yy - 390) / 700) ** 2))
    warm = np.exp(-(((xx - 100) / 650) ** 2 + ((yy - 50) / 520) ** 2))
    pixels = np.zeros((H, W, 3), dtype=np.float32)
    pixels[:] = (11, 18, 24)
    pixels += glow[..., None] * np.array([2, 15, 15])
    pixels += warm[..., None] * np.array([9, 5, 1])
    im = Image.fromarray(np.uint8(np.clip(pixels, 0, 255)))
    d = ImageDraw.Draw(im)
    d.line((96, 137, 1824, 137), fill='#27373E', width=1)
    return im


BASE = background()


def shell(d):
    roundbox(d, (738, 200, 1824, 854), PANEL, 26, '#34454D', 2)
    roundbox(d, (763, 226, 805, 268), '#233C40', 11)
    text(d, (773, 233), '>_', 20, MINT, mono=True)
    text(d, (824, 236), 'Client application concept', 25, WHITE, True)
    pill(d, 1633, 227, 'CHAT', '#213239', MUTED, 18)
    d.line((764, 288, 1798, 288), fill='#2A3D46', width=1)


def person(d, x, y, name='Abhinav Chhabra'):
    d.ellipse((x, y, x + 34, y + 34), fill=MINT)
    text(d, (x + 7, y + 7), 'A', 18, BG, True)
    text(d, (x + 48, y + 4), name, 24, WHITE, True)


def assistant(d, x, y):
    roundbox(d, (x, y, x + 34, y + 34), '#36515A', 9)
    text(d, (x + 8, y + 6), '*', 24, MINT, True)
    text(d, (x + 48, y + 4), 'Assistant', 24, WHITE, True)


def left(d, scene):
    text(d, (96, 235), scene['label'], 24, MINT, True)
    title = scene['title']
    text(d, (91, 328), title, 67, WHITE, True, spacing=15)
    lines = title.count('\n') + 1
    text(d, (97, 340 + lines * 84 + 48), scene['detail'], 29, MUTED, spacing=15)


def small_brief(d):
    roundbox(d, (777, 310, 1785, 420), '#20343C', 15)
    text(d, (802, 329), 'ABHINAV’S BRIEF', 17, MINT, True)
    text(d, (802, 361), 'Monitor industry channels. Recommend the next best action.', 27)


def requirements(d, local=True):
    assistant(d, 787, 454)
    for y, number, label in [(514, '01', 'Connect industry data channels'), (576, '02', 'Rank signals and recommend actions')]:
        text(d, (791, y), number, 23, '#738D98', mono=True)
        text(d, (850, y - 1), label, 29)
    if local:
        roundbox(d, (778, 631, 1785, 727), '#3C3027', 14, '#A66F45', 1)
        text(d, (800, 650), '03', 23, AMBER, mono=True)
        text(d, (855, 648), 'Deploy locally on the client’s machine.', 29, AMBER, True)
        text(d, (855, 691), 'NOT SPECIFIED BY THE USER', 16, AMBER, True)


def intro(im, d, t):
    text(d, (95, 242), 'A SMALL ASSUMPTION. A LONG SHADOW.', 24, MINT, True)
    text(d, (89, 348), 'One assumption.', 92, WHITE, True)
    text(d, (89, 461), 'Every next reply.', 92, '#AFC0C7', True)
    text(d, (98, 622), 'What if we could repair the conversation itself?', 33, MUTED)
    roundbox(d, (1205, 285, 1808, 755), PANEL, 30, '#3A4C53', 2)
    text(d, (1247, 331), 'THE UNASKED REQUIREMENT', 20, AMBER, True)
    roundbox(d, (1243, 392, 1770, 510), '#3C3027', 18)
    text(d, (1270, 416), '“Deploy it locally.”', 42, AMBER, True)
    d.line((1507, 544, 1507, 581), fill='#55706F', width=3)
    d.polygon([(1498, 575), (1516, 575), (1507, 586)], fill='#55706F')
    pill(d, 1290, 615, 'CARRIED INTO THE NEXT REPLY', '#233B3D', MUTED, 18)


def brief(im, d, t):
    left(d, SCENES[1]); shell(d)
    person(d, 786, 322)
    roundbox(d, (783, 380, 1784, 640), '#20343C', 20)
    body = 'I’m building an autonomous system for my client. It should monitor every industry channel and recommend the next best action.'
    text(d, (812, 410), wrap(body, 925, 34), 34, spacing=15)
    pill(d, 790, 676, 'DEPLOYMENT: NOT SPECIFIED', '#203333', MINT, 20)
    roundbox(d, (783, 773, 1782, 826), '#172A32', 14, '#30454D')
    text(d, (806, 786), 'Message the assistant…', 24, '#78939F')


def drift(im, d, t):
    left(d, SCENES[2]); shell(d); small_brief(d); requirements(d)
    pill(d, 790, 766, 'AN ASSUMPTION BECOMES CONTEXT', '#3C3027', AMBER, 18)


def denoise(im, d, t):
    left(d, SCENES[3]); shell(d); small_brief(d)
    assistant(d, 787, 446)
    text(d, (835, 494), '…deploy locally on the client’s machine.', 31, AMBER)
    roundbox(d, (779, 565, 1786, 770), '#163831', 20, MINT, 2)
    command = '/context-denoising'
    count = min(len(command), int(max(t - 13.15, 0) * 21))
    text(d, (811, 590), command[:count], 32, MINT, True, mono=True)
    if t < 14.2 and int(t * 4) % 2 == 0:
        cx = 812 + font(32, True, True).getlength(command[:count])
        d.rectangle((cx + 3, 589, cx + 6, 626), fill=MINT)
    if t > 14.0:
        text(d, (811, 647), 'I never specified local deployment.\nRemove that assumption from the history.', 29, WHITE, spacing=14)
    if t > 16:
        dot_x, dot_y = 801, 804
        angle = int(t * 240) % 360
        d.arc((dot_x - 10, dot_y - 10, dot_x + 10, dot_y + 10), angle, angle + 255, fill=MINT, width=3)
        text(d, (829, 790), 'Denoising conversation context…', 24, MINT)
    else:
        text(d, (800, 790), 'Describe the assumption you want removed.', 24, MUTED)


def repair(im, d, t):
    left(d, SCENES[4]); shell(d)
    pill(d, 786, 315, 'SAVED CONVERSATION HISTORY', '#203B35', MINT, 18)
    assistant(d, 790, 381)
    text(d, (849, 447), '01   Connect industry data channels', 29)
    text(d, (849, 505), '02   Rank signals and recommend actions', 29)
    roundbox(d, (785, 560, 1784, 685), '#1C3A33', 16, '#3D7861', 1)
    if t < 20:
        old = 'Deploy locally on the client’s machine.'
        text(d, (850, 580), old, 29, '#9F8A79')
        end_x = 850 + font(29).getlength(old)
        amount = min(1, max(0, (t - 18.2) / .8))
        d.line((849, 596, 849 + (end_x - 849) * amount, 596), fill=AMBER, width=3)
        if t > 19.1:
            text(d, (850, 631), 'Clarify deployment needs with the client.', 29, MINT, True)
    else:
        text(d, (804, 584), '03', 23, MINT, mono=True)
        text(d, (858, 580), 'Clarify deployment needs with the client.', 29, MINT, True)
        text(d, (858, 630), 'INVENTED LOCAL-ONLY REQUIREMENT REMOVED', 17, MINT, True)
    for x, title, detail in [(785, 'Saved chat', 'History updated'), (1290, 'Next model input', 'Revised history')]:
        roundbox(d, (x, 721, x + 492, 819), '#1B2D35', 15)
        check(d, x + 22, 751)
        text(d, (x + 65, 739), title, 24, WHITE, True)
        text(d, (x + 65, 776), detail, 20, MUTED)


def continuation(im, d, t):
    left(d, SCENES[5]); shell(d)
    person(d, 788, 321)
    roundbox(d, (783, 373, 1785, 452), '#20343C', 17)
    text(d, (811, 396), 'What should we prototype first?', 32)
    assistant(d, 787, 490)
    text(d, (834, 552), 'Start with channel monitoring and action ranking.', 31)
    text(d, (834, 609), 'Deployment is still an open decision.', 31, MINT, True)
    pill(d, 834, 700, 'NO INVENTED LOCAL-ONLY REQUIREMENT', '#203B35', MINT, 18)
    text(d, (834, 774), 'Same conversation. Revised context.', 24, MUTED)


def end(im, d, t):
    label = '/context-denoising'
    width = font(31, True, True).getlength(label) + 58
    x = (W - width) / 2
    roundbox(d, (x, 236, x + width, 307), '#1C3C33', 20, '#3F7B63', 1)
    text(d, (x + 29, 254), label, 31, MINT, True, mono=True)
    for y, label in [(381, 'Denoise the context.'), (493, 'Keep the conversation.')]:
        tw = font(88, True).getlength(label)
        text(d, ((W - tw) / 2, y), label, 88, WHITE, True)
    label = 'Repeat whenever assumptions creep in.'
    tw = font(31).getlength(label)
    text(d, ((W - tw) / 2, 653), label, 31, MUTED)
    label = 'A concept by Abhinav Chhabra'
    tw = font(24).getlength(label)
    text(d, ((W - tw) / 2, 766), label, 24, MINT)


RENDERERS = [intro, brief, drift, denoise, repair, continuation, end]


def ease(x):
    x = max(0, min(1, x))
    return 1 - (1 - x) ** 3


def stage(index, t):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    RENDERERS[index](layer, ImageDraw.Draw(layer), t)
    return layer


def frame(t):
    index = max(i for i, scene in enumerate(SCENES) if t >= scene['start'])
    scene = SCENES[index]
    im = BASE.copy().convert('RGBA')
    progress = ease((t - scene['start']) / .40)
    if index > 0 and progress < 1:
        previous = stage(index - 1, scene['start'] - .01)
        previous.putalpha(previous.getchannel('A').point(lambda v: int(v * (1 - progress))))
        im.alpha_composite(previous, (-int(progress * 22), 0))
    current = stage(index, t)
    if progress < 1:
        current.putalpha(current.getchannel('A').point(lambda v: int(v * progress)))
    im.alpha_composite(current, (int((1 - progress) * 30), 0))
    d = ImageDraw.Draw(im)
    roundbox(d, (96, 63, 143, 109), '#1D3B36', 12)
    text(d, (106, 72), '>_', 22, MINT, mono=True)
    text(d, (162, 73), 'context-denoising', 28, WHITE, True)
    pill(d, 1430, 65, 'CONCEPT DEMO', '#21343B', MUTED, 18)
    text(d, (1653, 76), f'00:{min(30, int(t)):02d} / 00:30', 18, MUTED, mono=True)
    # Open captions ensure that the film also works without sound.
    caption = wrap(scene['caption'], 1630, 29)
    count = caption.count('\n') + 1
    roundbox(d, (96, 896, 1824, 982), '#15232B', 18)
    for j, line in enumerate(caption.split('\n')):
        tw = font(29).getlength(line)
        text(d, ((W - tw) / 2, 914 + (j - (count - 1) / 2) * 35), line, 29, '#DDE9ED')
    d.line((96, 1015, 1824, 1015), fill='#2D414A', width=4)
    d.line((96, 1015, 96 + 1728 * t / DURATION, 1015), fill=MINT, width=4)
    text(d, (96, 1034), 'ABHINAV CHHABRA', 15, '#849DA9', True)
    label = 'BRIEF  →  ASSUMPTION  →  DENOISE  →  REVISED HISTORY'
    text(d, (1231, 1034), label, 15, '#849DA9')
    return im.convert('RGB')


def previews():
    samples = [1.4, 5.0, 10.5, 15.8, 21.5, 26, 29]
    thumbs = []
    for i, t in enumerate(samples):
        im = frame(t)
        im.save(OUT / f'frame-{i + 1:02d}.png')
        thumbs.append(im.resize((640, 360), Image.Resampling.LANCZOS))
    sheet = Image.new('RGB', (1280, 4 * 360), BG)
    for i, im in enumerate(thumbs):
        sheet.paste(im, ((i % 2) * 640, (i // 2) * 360))
    sheet.save(OUT / 'storyboard.png')
    print('Storyboard:', OUT / 'storyboard.png', flush=True)


def duration(path):
    result = subprocess.run([FFMPEG, '-hide_banner', '-i', str(path)], capture_output=True, text=True)
    import re
    match = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', result.stderr)
    if not match:
        raise RuntimeError(f'No audio duration available for {path.name}')
    hours, minutes, seconds = map(float, match.groups())
    return hours * 3600 + minutes * 60 + seconds


def speech():
    args = []
    filters = []
    for i, scene in enumerate(SCENES):
        audio = OUT / f'narration-{i + 1:02d}.aiff'
        subprocess.run(['say', '-v', 'Daniel', '-r', '185', '-o', str(audio), scene['voice']], check=True)
        actual = duration(audio)
        if actual < .1:
            raise RuntimeError('macOS speech service returned empty audio')
        slot = scene['end'] - scene['start'] - .35
        tempo = max(1.0, actual / slot)
        delay = int((scene['start'] + .14) * 1000)
        args += ['-i', str(audio)]
        filters.append(f'[{i}:a]atempo={tempo:.5f},aresample=48000,volume=0.90,afade=t=out:st={max(.05, actual / tempo - .07):.3f}:d=0.06,adelay={delay}:all=1[a{i}]')
        print(f'Narration {i + 1}: {actual:.2f}s, speed {tempo:.2f}x', flush=True)
    filters.append(''.join(f'[a{i}]' for i in range(len(SCENES))) + f'amix=inputs={len(SCENES)}:normalize=0,apad,atrim=0:30,alimiter=limit=0.96[voice]')
    target = OUT / 'narration.wav'
    subprocess.run([FFMPEG, '-y', '-v', 'error', *args, '-filter_complex', ';'.join(filters), '-map', '[voice]', '-ar', '48000', str(target)], check=True)
    return target


def subtitles():
    def stamp(t):
        return f'00:00:{int(t):02d},{int((t % 1) * 1000):03d}'
    content = '\n\n'.join(f'{i + 1}\n{stamp(s["start"])} --> {stamp(s["end"])}\n{s["caption"]}' for i, s in enumerate(SCENES)) + '\n'
    (OUT / 'context-denoising.srt').write_text(content)
    (OUT / 'storyboard.json').write_text(json.dumps(SCENES, indent=2))


def render():
    voice = speech()
    temp = OUT / 'animation-silent.mp4'
    command = [FFMPEG, '-y', '-v', 'warning', '-f', 'rawvideo', '-vcodec', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(temp)]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for i in range(FPS * DURATION):
            encoder.stdin.write(frame(i / FPS).tobytes())
            if i % (FPS * 5) == 0:
                print(f'Rendered {i / FPS:.0f} / {DURATION} seconds', flush=True)
        encoder.stdin.close()
        if encoder.wait() != 0:
            raise RuntimeError('Video encoding failed')
    except BaseException:
        encoder.kill()
        encoder.wait()
        raise
    target = OUT / 'context-denoising-concept.mp4'
    subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', str(temp), '-i', str(voice), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', '30', '-movflags', '+faststart', '-metadata', 'title=Context Denoising — A concept by Abhinav Chhabra', '-metadata', 'comment=Illustrative concept demonstration. Narration generated locally with the macOS Daniel voice.', str(target)], check=True)
    print('Finished:', target, flush=True)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    previews()
    subtitles()
    if '--preview' not in sys.argv:
        render()
