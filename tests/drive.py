# Drive and capture an X11 window: python drive.py "<title>" out.png [action ...]
# Actions: "ctrl+k", "text:heap", "Return", "Escape", "sleep:1.5", "shot:path.png", "click:x,y" (window-relative)
import sys, time
from Xlib import display, X, XK
from Xlib.ext import xtest
from PIL import Image

d = display.Display(":0")
title = sys.argv[1]
args = [a for a in sys.argv[2:] if a != "--no-focus"]
focus = "--no-focus" not in sys.argv

def find(w):
    try:
        if w.get_wm_name() == title and w.get_geometry().width > 200 and w.get_attributes().map_state == X.IsViewable:
            return w
    except Exception:
        pass
    try:
        for c in w.query_tree().children:
            r = find(c)
            if r:
                return r
    except Exception:
        pass

w = None
for _ in range(40):
    w = find(d.screen().root)
    if w:
        break
    time.sleep(0.5)
if not w:
    sys.exit("window not found")

def shot(path):
    g = w.get_geometry()
    raw = w.get_image(0, 0, g.width, g.height, X.ZPixmap, 0xFFFFFFFF)
    Image.frombytes("RGB", (g.width, g.height), raw.data, "raw", "BGRX").save(path)
    print("shot", path, g.width, g.height, flush=True)

def key(name, press):
    code = d.keysym_to_keycode(XK.string_to_keysym(name))
    xtest.fake_input(d, X.KeyPress if press else X.KeyRelease, code)

def combo(spec):
    parts = spec.split("+")
    mods = [{"ctrl": "Control_L", "alt": "Alt_L", "shift": "Shift_L"}[m] for m in parts[:-1]]
    for m in mods: key(m, True)
    key(parts[-1], True); key(parts[-1], False)
    for m in reversed(mods): key(m, False)
    d.sync(); time.sleep(0.05)

def click(x, y):
    # A real click focuses the window reliably under WSLg, unlike set_input_focus.
    root = d.screen().root
    t = w.translate_coords(root, x, y)
    xtest.fake_input(d, X.MotionNotify, x=t.x, y=t.y); d.sync(); time.sleep(0.05)
    xtest.fake_input(d, X.ButtonPress, 1); d.sync(); time.sleep(0.05)
    xtest.fake_input(d, X.ButtonRelease, 1); d.sync(); time.sleep(0.1)

SPECIAL = {" ": "space", ":": "colon", "-": "minus", ".": "period", "/": "slash"}
if focus:
    try:
        w.set_input_focus(X.RevertToParent, X.CurrentTime); d.sync()
    except Exception as e:
        print("focus:", e)
    time.sleep(0.3)
for a in args:
    if a.startswith("sleep:"): time.sleep(float(a[6:]))
    elif a.startswith("shot:"): shot(a[5:])
    elif a.startswith("click:"):
        x, y = map(int, a[6:].split(",")); click(x, y)
    elif a.startswith("text:"):
        for ch in a[5:]:
            if ch.isupper(): combo("shift+" + ch.lower())
            else: combo(SPECIAL.get(ch, ch))
    else: combo(a)
