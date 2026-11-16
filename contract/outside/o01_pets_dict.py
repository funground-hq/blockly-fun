# a dictionary of pets and their ages
pets = {"Rex": 3, "Tom": 5}
pets["Bella"] = 2

for name, age in pets.items():
    print(f"{name} is {age} years old")

oldest = max(pets, key=pets.get)
print("The oldest is", oldest)
