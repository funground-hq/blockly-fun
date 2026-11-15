import funground as f

x = 50
speed = 4


def setup():
    f.size(640, 400)


def draw():
    global x, speed

    f.background("midnightblue")
    f.stroke("white")
    f.line(0, 300, f.width, 300)
    f.fill("gold")
    f.circle(x, 260, 80)
    x += speed
    if x > f.width - 40 or x < 40:
        speed = -speed
    f.fill("white")
    f.text("Frame " + str(f.frame_count), 20, 40)
    f.rect(f.mouse_x, f.mouse_y, 20, 20)


f.run()
