score = 0
lives = 3

while lives > 0:
    answer = input("Did you catch the apple? (y/n) ")
    if answer == "y":
        score = score + 10
        print("Score:", score)
    else:
        lives = lives - 1
        print("Oops! Lives left:", lives)

print("Game over. Final score:", score)
