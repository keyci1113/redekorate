"""Genera pantallas de prueba (PNG) para el seed de datos de test.
Uso: python -I scripts/seed/make_images.py <carpeta_salida>
Escribe los PNG y layout.json con las zonas (normalizadas 0–1) que usa seed-test.ts.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def font(size, bold=False):
    for name in (["segoeuib.ttf", "arialbd.ttf"] if bold else ["segoeui.ttf", "arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

INK, INK2, LINE, BG, CARD = "#1F1633", "#6B6680", "#E4E1EC", "#F6F5F9", "#FFFFFF"
ACCENT, GOOD = "#5902A1", "#059669"
layout = {}

# ── Pantallas móviles del prototipo (2x) ─────────────────────────────
W, H = 780, 1688

class Screen:
    def __init__(self, key, title, back=False):
        self.key, self.img = key, Image.new("RGB", (W, H), BG)
        self.d = ImageDraw.Draw(self.img)
        self.zones = {}
        self.d.rectangle([0, 0, W, 200], fill=CARD)
        self.d.line([0, 200, W, 200], fill=LINE, width=2)
        self.d.text((60 if not back else 120, 110), title, font=font(46, True), fill=INK)
        if back:
            self.d.text((44, 104), "‹", font=font(64, True), fill=ACCENT)
            self.zone("back", 20, 90, 100, 90)

    def zone(self, name, x, y, w, h):
        self.zones[name] = {"x": round(x / W, 4), "y": round(y / H, 4), "w": round(w / W, 4), "h": round(h / H, 4)}

    def row(self, name, y, label, sub=None, right="›"):
        self.d.rounded_rectangle([40, y, W - 40, y + 140], 28, fill=CARD, outline=LINE, width=2)
        self.d.text((80, y + (30 if sub else 48)), label, font=font(36, True), fill=INK)
        if sub:
            self.d.text((80, y + 84), sub, font=font(28), fill=INK2)
        self.d.text((W - 100, y + 36), right, font=font(56), fill=INK2)
        self.zone(name, 40, y, W - 80, 140)

    def button(self, name, y, label, primary=True):
        self.d.rounded_rectangle([40, y, W - 40, y + 120], 60, fill=ACCENT if primary else CARD, outline=ACCENT, width=3)
        tw = self.d.textlength(label, font=font(36, True))
        self.d.text(((W - tw) / 2, y + 38), label, font=font(36, True), fill="#FFFFFF" if primary else ACCENT)
        self.zone(name, 40, y, W - 80, 120)

    def tabbar(self, active):
        self.d.rectangle([0, H - 170, W, H], fill=CARD)
        self.d.line([0, H - 170, W, H - 170], fill=LINE, width=2)
        tabs = ["Inicio", "Buscar", "Pedidos", "Cuenta"]
        tw = W / len(tabs)
        for i, t in enumerate(tabs):
            cx = tw * i + tw / 2
            col = ACCENT if t == active else INK2
            self.d.ellipse([cx - 22, H - 140, cx + 22, H - 96], outline=col, width=4)
            lw = self.d.textlength(t, font=font(26, t == active))
            self.d.text((cx - lw / 2, H - 80), t, font=font(26, t == active), fill=col)
            self.zone("tab_" + t.lower(), tw * i, H - 170, tw, 170)

    def save(self, name):
        path = os.path.join(OUT, f"proto_{self.key}.png")
        self.img.save(path, optimize=True)
        layout.setdefault("proto", []).append({"key": self.key, "name": name, "file": os.path.basename(path), "width": W, "height": H, "zones": self.zones})

s = Screen("home", "Hola, Keyci")
s.d.rounded_rectangle([40, 250, W - 40, 560], 36, fill=ACCENT)
s.d.text((90, 300), "Tu pedido va en camino", font=font(40, True), fill="#FFFFFF")
s.d.text((90, 370), "Llega entre 13:20 y 13:40", font=font(30), fill="#E9DDF7")
s.d.text((90, 470), "Ver detalle  ›", font=font(30, True), fill="#FFFFFF")
s.zone("banner", 40, 250, W - 80, 310)
s.d.text((60, 620), "Restaurantes cerca", font=font(36, True), fill=INK)
for i, (n, m) in enumerate([("Tacos El Güero", "25–35 min · $$"), ("Sushi Nori", "30–40 min · $$$"), ("La Pizzería", "20–30 min · $")]):
    s.row(f"rest{i}", 690 + i * 170, n, m)
s.tabbar("Inicio")
s.save("01 Inicio")

s = Screen("orders", "Mis pedidos")
s.d.text((60, 240), "Activos", font=font(30, True), fill=INK2)
s.row("order_active", 290, "Tacos El Güero", "En camino · $214.00")
s.d.text((60, 480), "Historial", font=font(30, True), fill=INK2)
for i, (n, m) in enumerate([("Sushi Nori", "2 nov · $389.50"), ("La Pizzería", "28 oct · $176.00"), ("Café Central", "21 oct · $92.00")]):
    s.row(f"order_past{i}", 530 + i * 170, n, m)
s.tabbar("Pedidos")
s.save("02 Pedidos")

s = Screen("order_detail", "Pedido #4821", back=True)
s.d.rounded_rectangle([40, 250, W - 40, 620], 36, fill=CARD, outline=LINE, width=2)
s.d.text((90, 290), "En camino", font=font(44, True), fill=GOOD)
s.d.text((90, 360), "Llega entre 13:20 y 13:40", font=font(32), fill=INK)
for i, st in enumerate(["Confirmado", "Preparando", "En camino", "Entregado"]):
    x = 90 + i * 160
    s.d.ellipse([x, 450, x + 36, 486], fill=GOOD if i < 3 else LINE)
    s.d.text((x - 10, 510), st, font=font(22), fill=INK2)
s.row("courier", 670, "Repartidor: Luis", "Moto · ABC-123", right="›")
s.button("help", 1400, "Necesito ayuda", primary=False)
s.save("03 Detalle de pedido")

s = Screen("account", "Cuenta")
for i, (n, m) in enumerate([("Perfil", "Nombre, correo y teléfono"), ("Pagos", "Tarjetas y facturas"), ("Direcciones", "Casa, Oficina"), ("Notificaciones", "Push y correo"), ("Ayuda", "Preguntas frecuentes")]):
    s.row(["profile", "payments", "addresses", "notifications", "help"][i], 250 + i * 170, n, m)
s.tabbar("Cuenta")
s.save("04 Cuenta")

s = Screen("payments", "Pagos", back=True)
s.row("methods", 250, "Métodos de pago", "2 tarjetas guardadas")
s.row("invoices", 420, "Facturas", "Descarga tus CFDI")
s.row("coupons", 590, "Cupones", "1 disponible")
s.save("05 Pagos")

s = Screen("methods", "Métodos de pago", back=True)
s.row("visa", 250, "Visa •••• 4242", "Predeterminada", right="●")
s.row("mc", 420, "Mastercard •••• 8812", "Vence 09/28")
s.button("make_default", 620, "Usar Mastercard como predeterminada")
s.button("add", 780, "+ Agregar tarjeta", primary=False)
s.save("06 Métodos de pago")

s = Screen("methods_ok", "Métodos de pago", back=True)
s.d.rounded_rectangle([40, 250, W - 40, 400], 28, fill="#D1FAE5")
s.d.text((90, 300), "Listo: Mastercard es tu tarjeta predeterminada", font=font(30, True), fill=GOOD)
s.row("visa2", 440, "Visa •••• 4242", "Vence 03/27")
s.row("mc2", 610, "Mastercard •••• 8812", "Predeterminada", right="●")
s.save("07 Método actualizado")

# ── Pantallas de escritorio ─────────────────────────────────────────
DW, DH = 1440, 900

def desktop(name, hero_title, hero_sub, cta, variant="A"):
    img = Image.new("RGB", (DW, DH), "#FFFFFF" if variant == "A" else "#1F1633")
    d = ImageDraw.Draw(img)
    fg = INK if variant == "A" else "#FFFFFF"
    sub = INK2 if variant == "A" else "#C9C2DA"
    d.rectangle([0, 0, DW, 84], fill="#FFFFFF" if variant == "A" else "#2A1F45")
    d.text((60, 24), "comida·ya", font=font(32, True), fill=ACCENT if variant == "A" else "#D8B4FE")
    nav = ["Restaurantes", "Ofertas", "Mis pedidos", "Ayuda"]
    zones = {}
    x = 760
    for n in nav:
        w = d.textlength(n, font=font(22, True))
        d.text((x, 30), n, font=font(22, True), fill=fg)
        zones[n] = {"x": round((x - 14) / DW, 4), "y": round(14 / DH, 4), "w": round((w + 28) / DW, 4), "h": round(56 / DH, 4)}
        x += w + 48
    d.ellipse([DW - 100, 20, DW - 56, 64], fill=ACCENT)
    zones["avatar"] = {"x": round((DW - 104) / DW, 4), "y": 0.02, "w": round(52 / DW, 4), "h": 0.06}
    d.text((120, 260), hero_title, font=font(64, True), fill=fg)
    d.text((120, 360), hero_sub, font=font(28), fill=sub)
    d.rounded_rectangle([120, 450, 460, 530], 40, fill=ACCENT)
    d.text((160, 472), cta, font=font(28, True), fill="#FFFFFF")
    zones["cta"] = {"x": round(120 / DW, 4), "y": round(450 / DH, 4), "w": round(340 / DW, 4), "h": round(80 / DH, 4)}
    d.rounded_rectangle([860, 180, 1340, 760], 40, fill="#EDE4F7" if variant == "A" else "#3B2D5C")
    for i in range(3):
        d.rounded_rectangle([900, 220 + i * 170, 1300, 360 + i * 170], 24, fill="#FFFFFF" if variant == "A" else "#4A3A70")
    img.save(os.path.join(OUT, name), optimize=True)
    return {"file": name, "width": DW, "height": DH, "zones": zones}

layout["first_click"] = desktop("desk_home.png", "Tu comida favorita,", "Más de 2,000 restaurantes con entrega en 30 minutos.", "Pedir ahora")
layout["five_second"] = desktop("desk_landing.png", "Envío gratis hoy", "Pide de tus restaurantes favoritos sin costo de envío.", "Ver ofertas")
layout["pref_a"] = desktop("pref_a.png", "Pide en minutos", "Diseño claro, con foco en la búsqueda.", "Buscar comida", "A")
layout["pref_b"] = desktop("pref_b.png", "Pide en minutos", "Diseño oscuro, con foco en promociones.", "Ver promos", "B")

with open(os.path.join(OUT, "layout.json"), "w", encoding="utf-8") as f:
    json.dump(layout, f, ensure_ascii=False, indent=1)
print("ok", len(os.listdir(OUT)), "archivos")
