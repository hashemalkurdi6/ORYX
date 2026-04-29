"""Generate ORYX icon + splash PNGs from the Mark B brand geometry.

Why a script instead of a designed asset: the Mark B logo is fully geometric
(arcs + cubic beziers + a dot), so it can be rendered programmatically with
the exact same coordinates the React Native Logo component uses. That keeps
the launch icon, splash, and in-app logo guaranteed pixel-consistent — no
manual export, no version drift.

Outputs:
    armen/mobile/assets/icon.png    — 1024×1024 RGB, no alpha (Apple compliant)
    armen/mobile/assets/splash.png  — 2048×2732 RGB, no alpha

Apple constraints honoured:
    • RGB mode (no alpha channel)
    • No pre-rounded corners — Apple rounds automatically
    • Solid background (#141820 brand dark)

Run:
    cd armen/backend && source .venv/bin/activate
    python scripts/build_brand_assets.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Brand colours — verbatim from services/theme.ts (themeDark).
BG_DARK = (20, 24, 32)        # #141820
LIME    = (222, 255, 71)      # #DEFF47 — accent
BLUE    = (91, 168, 255)      # #5BA8FF — signal.load
WHITE   = (244, 245, 247)     # #F4F5F7 — text.primary
LIME_DESAT = (255, 255, 255)  # used at low alpha for ambient glow

# Mark B geometry in the canonical 64×64 viewBox.
CX, CY = 32.0, 50.0
RO, RI = 26.0, 18.0
LEFT_HORN  = ((CX, CY), (CX - 6, CY - 14), (CX - 14, CY - 28), (CX - 18, CY - 44))
RIGHT_HORN = ((CX, CY), (CX + 6, CY - 14), (CX + 14, CY - 28), (CX + 18, CY - 44))

# Supersampling factor for smooth strokes — render at SUPER× then downsample.
SUPER = 4


def cubic_bezier(p0, p1, p2, p3, samples=2000):
    """Evaluate a cubic Bezier at evenly-spaced t to get a polyline."""
    pts = []
    for i in range(samples + 1):
        t = i / samples
        u = 1.0 - t
        x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]
        y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        pts.append((x, y))
    return pts


def stamp_stroke(draw: ImageDraw.ImageDraw, pts, color, width: int) -> None:
    """Draw a smooth stroke by stamping a filled disc at each point.

    PIL's draw.line with joint='curve' produces visible segment ridges on
    long curved paths. Stamping discs at high resolution gives a perfectly
    uniform stroke at the cost of being O(n) draw calls.
    """
    radius = max(1, width // 2)
    for x, y in pts:
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color)


def draw_mark(draw: ImageDraw.ImageDraw, *, mark_size: int, cx_canvas: float, cy_canvas: float,
              horn_color=WHITE, accent_color=LIME, load_color=BLUE) -> None:
    """Draw the Mark B logo centred at (cx_canvas, cy_canvas) at mark_size px."""
    scale = mark_size / 64.0

    # Convert a viewBox-space point into canvas-space, anchoring the mark's
    # midpoint (32, 32 in viewBox terms — note the geometry leaves vertical
    # space above the horns, so we anchor on the visual centre, not the bbox).
    def vb(x: float, y: float):
        return (cx_canvas + (x - 32.0) * scale,
                cy_canvas + (y - 32.0) * scale)

    # Stroke widths — proportional to mark_size so the icon scales cleanly.
    sw_outer = max(2, round(1.8 * scale))
    sw_inner = max(2, round(1.2 * scale))
    sw_horn  = max(2, round(2.6 * scale))

    # Outer readiness arc — top half of a circle centred at (32, 50), r=26.
    # PIL.arc angles: 0° = 3 o'clock, increasing clockwise. 180° → 360° draws
    # the upper half (we travel from 9 o'clock CCW visually = top arc).
    bbox_outer = [vb(CX - RO, CY - RO), vb(CX + RO, CY + RO)]
    bbox_outer = [bbox_outer[0][0], bbox_outer[0][1], bbox_outer[1][0], bbox_outer[1][1]]
    draw.arc(bbox_outer, start=180, end=360, fill=accent_color, width=sw_outer)

    # Inner load arc.
    bbox_inner = [vb(CX - RI, CY - RI), vb(CX + RI, CY + RI)]
    bbox_inner = [bbox_inner[0][0], bbox_inner[0][1], bbox_inner[1][0], bbox_inner[1][1]]
    draw.arc(bbox_inner, start=180, end=360, fill=load_color, width=sw_inner)

    # Horns — sample each cubic bezier densely and stamp filled discs along
    # the curve. Smoother than draw.line with joint='curve' which leaves
    # visible segment artefacts on long curved paths.
    left = [vb(*p) for p in cubic_bezier(*LEFT_HORN)]
    right = [vb(*p) for p in cubic_bezier(*RIGHT_HORN)]
    stamp_stroke(draw, left, horn_color, sw_horn)
    stamp_stroke(draw, right, horn_color, sw_horn)

    # Centre dot — same lime as accent.
    dot_r = max(3, round(3 * scale))
    draw.ellipse(
        [vb(CX, CY)[0] - dot_r, vb(CX, CY)[1] - dot_r,
         vb(CX, CY)[0] + dot_r, vb(CX, CY)[1] + dot_r],
        fill=accent_color,
    )


def render_canvas(width: int, height: int, *, mark_size: int,
                  cx_canvas: float | None = None, cy_canvas: float | None = None) -> Image.Image:
    """Render at SUPER× then downsample with LANCZOS for smooth edges."""
    canvas_w = width * SUPER
    canvas_h = height * SUPER
    big = Image.new('RGB', (canvas_w, canvas_h), BG_DARK)
    draw = ImageDraw.Draw(big)

    centre_x = (cx_canvas if cx_canvas is not None else width / 2.0) * SUPER
    centre_y = (cy_canvas if cy_canvas is not None else height / 2.0) * SUPER
    draw_mark(draw, mark_size=mark_size * SUPER, cx_canvas=centre_x, cy_canvas=centre_y)

    return big.resize((width, height), Image.LANCZOS)


def main() -> int:
    out_dir = Path(__file__).resolve().parents[2] / 'mobile' / 'assets'
    out_dir.mkdir(parents=True, exist_ok=True)

    # Icon: 1024×1024, mark fills ~62 % of the canvas (matches brand sheet AppIcon).
    icon = render_canvas(1024, 1024, mark_size=int(1024 * 0.62))
    icon_path = out_dir / 'icon.png'
    icon.save(icon_path, 'PNG', optimize=True)
    assert icon.mode == 'RGB', 'icon must be RGB (no alpha) for App Store'
    print(f'wrote {icon_path}  size={icon.size}  mode={icon.mode}')

    # Splash: 2048×2732 (covers iPhone Pro Max @3x portrait). Mark is smaller
    # — ~30 % of the shorter edge — so the bg breathes around it.
    splash_w, splash_h = 2048, 2732
    splash = render_canvas(splash_w, splash_h, mark_size=int(min(splash_w, splash_h) * 0.30))
    splash_path = out_dir / 'splash.png'
    splash.save(splash_path, 'PNG', optimize=True)
    print(f'wrote {splash_path}  size={splash.size}  mode={splash.mode}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
