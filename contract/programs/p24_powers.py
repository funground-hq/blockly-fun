base = 2
for power in range(0, 11):
    print(base, "to the power", power, "is", base ** power)

seconds = 5000
minutes = seconds // 60
left = seconds % 60
print(seconds, "seconds is", minutes, "minutes and", left, "seconds")
