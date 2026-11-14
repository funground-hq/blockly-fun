import random

x = 0
y = 0
treasure_x = random.randint(1, 5)
treasure_y = random.randint(1, 5)
steps = 0

while not (x == treasure_x and y == treasure_y):
    move = input("Move (n/s/e/w): ")
    if move == "n":
        y += 1
    elif move == "s":
        y -= 1
    elif move == "e":
        x += 1
    elif move == "w":
        x -= 1
    else:
        print("I don't know that move")
        continue
    steps += 1
    print("You are at", x, y)

print("Found the treasure in", steps, "steps!")
