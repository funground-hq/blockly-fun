while True:
    try:
        age = int(input("How old are you? "))
        break
    except ValueError:
        print("Please type a number!")

if age >= 13:
    print("You are a teenager")
else:
    print("You will be a teenager in", 13 - age, "years")
