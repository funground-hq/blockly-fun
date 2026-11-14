size = 5

# triangle going up
for row in range(1, size + 1):
    print("*" * row)

# triangle going down
for row in range(size, 0, -1):
    print("*" * row)

# stars in a line
for i in range(size):
    print("*", end="")
print()
