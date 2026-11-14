age = int(input("Age: "))
is_student = input("Are you a student? (yes/no) ")

if age < 5:
    price = 0
elif age < 16 or is_student == "yes":
    price = 5
elif age >= 65:
    price = 4
else:
    price = 10

if price == 0:
    print("Free entry!")
else:
    print("Your ticket costs", price, "pounds")
