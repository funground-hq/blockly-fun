def is_even(n):
    return n % 2 == 0

for number in range(1, 11):
    if is_even(number):
        print(number, "is even")
    else:
        print(number, "is odd")
