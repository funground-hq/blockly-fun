def greet(name, times):
    for i in range(times):
        print("Hello, " + name + "!")

def square(x):
    return x * x

greet("Mia", 3)
print("5 squared is", square(5))
print("12 squared is", square(12))
