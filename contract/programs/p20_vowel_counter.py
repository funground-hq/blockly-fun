word = input("Type a word: ")
count = 0

for letter in word.lower():
    if letter in "aeiou":
        count = count + 1

print("There are", count, "vowels in", word)
print("The word has", len(word), "letters")
