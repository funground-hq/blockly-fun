def divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None


answer = divide(10, 0)
if answer is None:
    print("You cannot divide by zero")  # nobody can
else:
    print(answer)
