import random

heads = 0
tails = 0

for flip in range(20):
    if random.randint(0, 1) == 0:
        heads += 1
    else:
        tails += 1

print("Heads:", heads)
print("Tails:", tails)
if heads > tails:
    print("Heads wins")
elif tails > heads:
    print("Tails wins")
else:
    print("It's a tie")
