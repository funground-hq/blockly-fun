count = 0
while count < 3:
    count += 1
else:
    print("done counting")

double = lambda x: x * 2
print(double(4) if count else 0)
print((count if count > 1 else 1) + 1)
