marks = []
how_many = int(input("How many tests? "))

for i in range(how_many):
    m = float(input("Mark: "))
    marks.append(m)

total = 0
for m in marks:
    total = total + m

average = total / len(marks)
print("Average is", average)

if average >= 50:
    print("You passed")
else:
    print("Try harder next time")
