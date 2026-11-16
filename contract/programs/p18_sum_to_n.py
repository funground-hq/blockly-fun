n = int(input("Add up to: "))
total = 0

for i in range(1, n + 1):
    total = total + i

print("The sum of 1 to", n, "is", total)
print("Check:", n * (n + 1) // 2)
