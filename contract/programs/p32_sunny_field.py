import funground as f

f.size(400, 400)
f.background("skyblue")
f.fill("green")
f.rect(0, 300, 400, 100)
f.fill("yellow")
f.circle(320, 80, 90)
for i in range(5):
    f.circle(60 + i * 70, 280, 30)
f.show()
