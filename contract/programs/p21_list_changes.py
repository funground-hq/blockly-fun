fruits = ["apple", "banana", "cherry"]
print(fruits)

fruits.append("mango")
fruits[1] = "grape"
last = fruits.pop()
print("I removed", last)

print("First fruit:", fruits[0])
print("Number of fruits:", len(fruits))

if "cherry" in fruits:
    print("Cherry is still here")
