import random

# roll two dice five times
for turn in range(5):
    dice1 = random.randint(1, 6)
    dice2 = random.randint(1, 6)
    total = dice1 + dice2
    print("Roll", turn + 1, ":", dice1, "and", dice2, "=", total)
    if dice1 == dice2:
        print("Double!")
