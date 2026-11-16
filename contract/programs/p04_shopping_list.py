shopping = []

while True:
    item = input("Add an item (or type done): ")
    if item == "done":
        break
    shopping.append(item)

print("You need to buy", len(shopping), "things:")
for thing in shopping:
    print("-", thing)

if "milk" in shopping:
    print("Don't forget the milk!")
