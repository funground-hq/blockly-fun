import random

secret = random.randint(1, 20)
tries = 0

print("I am thinking of a number from 1 to 20.")
while True:
    guess = int(input("Your guess: "))
    tries = tries + 1
    if guess < secret:
        print("Too low!")
    elif guess > secret:
        print("Too high!")
    else:
        print("You got it in", tries, "tries!")
        break
