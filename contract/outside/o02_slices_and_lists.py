letters = list("rainbow")
print(letters[1:4])
squares = [n * n for n in range(1, 6)]
total = sum(squares) + squares[-1:][0]
print("Total:", total)

first, second = squares[0], squares[1]
print(first + second)
