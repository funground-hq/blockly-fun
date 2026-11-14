celsius = float(input("Temperature in C: "))
fahrenheit = celsius * 9 / 5 + 32
print(celsius, "C is", fahrenheit, "F")

if celsius < 10:
    print("Wear a coat!")
elif celsius > 25:
    print("It's hot!")
else:
    print("Nice weather.")
