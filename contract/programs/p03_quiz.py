score = 0

answer = input("What is the capital of France? ")
if answer.lower() == "paris":
    print("Correct!")
    score += 1
else:
    print("Nope, it is Paris.")

answer = input("How many legs does a spider have? ")
if answer == "8":
    print("Correct!")
    score += 1
else:
    print("Nope, it is 8.")

answer = input("What colour do you get from blue and yellow? ")
if answer.lower() == "green":
    print("Correct!")
    score += 1
else:
    print("Nope, it is green.")

print(f"You scored {score} out of 3")
